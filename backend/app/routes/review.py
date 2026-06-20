from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from uuid import UUID
from datetime import datetime
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

# Helper for Redis locking with local in-memory fallback
_local_locks = {}

def get_redis_client():
    try:
        r = redis.Redis(host=settings.REDIS_HOST, port=settings.REDIS_PORT, decode_responses=True, socket_connect_timeout=1)
        r.ping()
        return r
    except Exception:
        return None

def acquire_document_lock(document_id: str, username: str) -> bool:
    """
    Attempts to lock a document. Returns True if lock acquired, False if already locked.
    """
    lock_key = f"lock:document:{document_id}"
    r = get_redis_client()
    if r:
        # Lock expires in 15 minutes (900 seconds)
        return r.set(lock_key, username, ex=900, nx=True) == True
    else:
        # Fallback to local in-memory dict
        now = datetime.utcnow()
        if lock_key in _local_locks:
            holder, expiry = _local_locks[lock_key]
            if now < expiry:
                if holder == username:
                    return True
                return False
        _local_locks[lock_key] = (username, now + datetime.timedelta(minutes=15))
        return True

def release_document_lock(document_id: str):
    lock_key = f"lock:document:{document_id}"
    r = get_redis_client()
    if r:
        r.delete(lock_key)
    else:
        _local_locks.pop(lock_key, None)

def get_lock_holder(document_id: str) -> Optional[str]:
    lock_key = f"lock:document:{document_id}"
    r = get_redis_client()
    if r:
        return r.get(lock_key)
    else:
        if lock_key in _local_locks:
            holder, expiry = _local_locks[lock_key]
            if datetime.utcnow() < expiry:
                return holder
        return None

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
        # Check lock status
        lock_holder = get_lock_holder(str(doc.id))
        
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
