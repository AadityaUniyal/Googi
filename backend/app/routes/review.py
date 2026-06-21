from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from uuid import UUID
from datetime import datetime, timedelta
import redis
import logging

from app.database import get_db
from app.models.auth import User, UserRole
from app.models.document import Document, DocumentStatus, ExtractedField, FieldValidationStatus
from app.models.audit import AuditLog
from app.routes.auth import get_current_user, RoleChecker
from app.schemas.document import DocumentResponse, DocumentReviewSubmit, DocumentSimpleResponse
from app.config import settings

router = APIRouter(prefix="/api/review", tags=["review"])

logger = logging.getLogger(__name__)

# Role permissions
reviewer_or_admin = RoleChecker([UserRole.ADMIN, UserRole.REVIEWER])

# Lock TTL in seconds (15 minutes)
LOCK_TTL_SECONDS = 900


def get_redis_client() -> redis.Redis:
    """Return a Redis client or raise if Redis is unavailable."""
    try:
        r = redis.Redis(
            host=settings.REDIS_HOST,
            port=settings.REDIS_PORT,
            password=settings.REDIS_PASSWORD,
            decode_responses=True,
            socket_connect_timeout=2
        )
        r.ping()
        return r
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Redis is unavailable — document locking requires Redis. Error: {exc}",
        )


def acquire_document_lock(document_id: str, username: str) -> bool:
    """
    Attempts to lock a document using Redis SET NX EX (atomic set-if-not-exists with TTL).
    Returns True if lock acquired, False if already locked by another user.
    Raises HTTPException if Redis is unavailable.
    """
    lock_key = f"lock:document:{document_id}"
    r = get_redis_client()
    # If the current user already holds the lock, extend the TTL
    current_holder = r.get(lock_key)
    if current_holder == username:
        r.expire(lock_key, LOCK_TTL_SECONDS)
        return True
    # Attempt atomic lock
    return r.set(lock_key, username, ex=LOCK_TTL_SECONDS, nx=True) is True


def release_document_lock(document_id: str):
    lock_key = f"lock:document:{document_id}"
    r = get_redis_client()
    r.delete(lock_key)


def get_lock_holder(document_id: str) -> Optional[str]:
    lock_key = f"lock:document:{document_id}"
    r = get_redis_client()
    return r.get(lock_key)


# Get Review Queue
@router.get("/queue", response_model=List[DocumentSimpleResponse])
def get_review_queue(
    db: Session = Depends(get_db),
    current_user: User = Depends(reviewer_or_admin)
):
    documents = db.query(Document).filter(Document.status == DocumentStatus.AWAITING_REVIEW).order_by(Document.created_at.asc()).all()
    
    results = []
    for doc in documents:
        uploader_name = doc.uploader.full_name if doc.uploader else "System"
        # Check lock status — tolerate Redis being down for read-only queue listing
        try:
            lock_holder = get_lock_holder(str(doc.id))
        except HTTPException:
            lock_holder = None
        
        results.append({
            "id": doc.id,
            "filename": doc.filename,
            "file_type": doc.file_type,
            "category": doc.category,
            "status": doc.status,
            "consensus_score": doc.consensus_score,
            "created_at": doc.created_at,
            "uploader_name": f"{uploader_name} (Locked by {lock_holder})" if lock_holder else uploader_name
        })
    return results

# Lock document for review
@router.post("/{document_id}/lock", status_code=status.HTTP_200_OK)
def lock_document(
    document_id: UUID,
    current_user: User = Depends(reviewer_or_admin)
):
    doc_id_str = str(document_id)
    success = acquire_document_lock(doc_id_str, current_user.full_name)
    if not success:
        holder = get_lock_holder(doc_id_str) or "another user"
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"This document is currently locked for review by {holder}."
        )
    return {"message": "Document locked successfully", "locked_by": current_user.full_name}

# Heartbeat — extend lock TTL by another 15 minutes (only if the current user holds the lock)
@router.post("/{document_id}/heartbeat", status_code=status.HTTP_200_OK)
def heartbeat_lock(
    document_id: UUID,
    current_user: User = Depends(reviewer_or_admin)
):
    doc_id_str = str(document_id)
    lock_key = f"lock:document:{doc_id_str}"
    r = get_redis_client()
    current_holder = r.get(lock_key)
    if current_holder is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active lock found for this document."
        )
    if current_holder != current_user.full_name:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Lock is held by {current_holder}, not you."
        )
    r.expire(lock_key, LOCK_TTL_SECONDS)
    return {"message": "Lock extended successfully", "ttl_seconds": LOCK_TTL_SECONDS}

# Unlock document
@router.post("/{document_id}/unlock", status_code=status.HTTP_200_OK)
def unlock_document(
    document_id: UUID,
    current_user: User = Depends(reviewer_or_admin)
):
    doc_id_str = str(document_id)
    holder = get_lock_holder(doc_id_str)
    if holder and holder != current_user.full_name:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Cannot unlock document locked by {holder}."
        )
    release_document_lock(doc_id_str)
    return {"message": "Document unlocked successfully"}

# Submit review corrections
@router.post("/{document_id}/submit", response_model=DocumentResponse)
def submit_review(
    document_id: UUID,
    review_data: DocumentReviewSubmit,
    db: Session = Depends(get_db),
    current_user: User = Depends(reviewer_or_admin)
):
    doc_id_str = str(document_id)
    
    # Check if locked by someone else
    holder = get_lock_holder(doc_id_str)
    if holder and holder != current_user.full_name:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"This document is locked by {holder}. Please unlock it first."
        )
        
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    # Apply changes and calculate before/after difference for audit logs
    diffs = {}
    
    for update in review_data.updates:
        field = db.query(ExtractedField).filter(
            ExtractedField.document_id == document_id,
            ExtractedField.field_key == update.field_key
        ).first()
        
        if field:
            before_val = field.consensus_value
            after_val = update.consensus_value
            
            if before_val != after_val:
                field.consensus_value = after_val
                field.is_modified = True
                field.validation_status = FieldValidationStatus.MANUAL_CORRECTION
                field.confidence_score = 1.0  # Set to 100% since human corrected it
                
                diffs[update.field_key] = {
                    "before": before_val,
                    "after": after_val
                }
                
    # Update document status to PROCESSED
    doc.status = DocumentStatus.PROCESSED
    db.commit()
    
    # Release Lock
    release_document_lock(doc_id_str)
    
    # Write Correction Audit Log
    if diffs:
        audit = AuditLog(
            document_id=doc.id,
            user_id=current_user.id,
            action="HUMAN_REVIEW_CORRECTION",
            details={
                "reviewer": current_user.full_name,
                "corrections": diffs
            }
        )
        db.add(audit)
        db.commit()
        
    # Reload document
    db.refresh(doc)
    return doc

