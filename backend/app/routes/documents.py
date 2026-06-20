from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from uuid import UUID
import os

from app.database import get_db
from app.models.auth import User, UserRole
from app.models.document import Document, DocumentStatus, DocumentCategory, ExtractedField
from app.models.audit import AuditLog
from app.routes.auth import get_current_user, RoleChecker
from app.services.storage import save_uploaded_file, delete_stored_file
from app.services.queue import publish_document_event
from app.schemas.document import DocumentResponse, DocumentSimpleResponse

router = APIRouter(prefix="/api/documents", tags=["documents"])

# Role permissions
admin_or_operator = RoleChecker([UserRole.ADMIN, UserRole.OPERATOR])
any_user = RoleChecker([UserRole.ADMIN, UserRole.OPERATOR, UserRole.REVIEWER, UserRole.VIEWER])

# Upload file endpoint
@router.post("/upload", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_or_operator)
):
    # Save the file locally using storage service
    storage_data = save_uploaded_file(file)
    
    try:
        # Create database entry for document
        db_doc = Document(
            filename=storage_data["filename"],
            file_path=storage_data["file_path"],
            file_type=storage_data["file_type"],
            status=DocumentStatus.INGESTED,
            category=DocumentCategory.UNKNOWN,
            uploaded_by=current_user.id
        )
        db.add(db_doc)
        db.commit()
        db.refresh(db_doc)
        
        # Write Ingestion Audit Log
        audit = AuditLog(
            document_id=db_doc.id,
            user_id=current_user.id,
            action="INGEST_DOCUMENT",
            details={
                "filename": db_doc.filename,
                "file_type": db_doc.file_type,
                "size_bytes": storage_data["size_bytes"]
            }
        )
        db.add(audit)
        db.commit()
        
        # Enqueue document processing event
        publish_document_event("document.uploaded", db_doc.id)
        
        # Reload to ensure relationships are loaded
        return db.query(Document).filter(Document.id == db_doc.id).first()
        
    except Exception as e:
        # Clean up file in case of database registration errors
        delete_stored_file(storage_data["file_path"])
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to record document upload: {str(e)}"
        )

# List all documents
@router.get("", response_model=List[DocumentSimpleResponse])
def list_documents(
    category: Optional[DocumentCategory] = None,
    status: Optional[DocumentStatus] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(any_user)
):
    query = db.query(Document)
    if category:
        query = query.filter(Document.category == category)
    if status:
        query = query.filter(Document.status == status)
        
    documents = query.order_by(Document.created_at.desc()).all()
    
    # Format simple response containing uploader's name
    results = []
    for doc in documents:
        uploader_name = doc.uploader.full_name if doc.uploader else "System"
        results.append({
            "id": doc.id,
            "filename": doc.filename,
            "file_type": doc.file_type,
            "category": doc.category,
            "status": doc.status,
            "consensus_score": doc.consensus_score,
            "created_at": doc.created_at,
            "uploader_name": uploader_name
        })
        
    return results

# Get single document details
@router.get("/{document_id}", response_model=DocumentResponse)
def get_document(
    document_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(any_user)
):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc

# Reprocess document endpoint
@router.post("/{document_id}/reprocess", response_model=DocumentResponse)
def reprocess_document(
    document_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_or_operator)
):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    doc.status = DocumentStatus.INGESTED
    db.commit()
    
    # Audit reprocessing action
    audit = AuditLog(
        document_id=doc.id,
        user_id=current_user.id,
        action="TRIGGER_REPROCESS",
        details={"requested_by": current_user.email}
    )
    db.add(audit)
    db.commit()
    
    # Re-publish processing event
    publish_document_event("document.reprocess", doc.id)
    return doc

# Delete document
@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(
    document_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_or_operator)
):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    # Delete local file
    delete_stored_file(doc.file_path)
    
    # Create audit trail record before deletion (set document_id to None in table after deletion cascade)
    audit = AuditLog(
        user_id=current_user.id,
        action="DELETE_DOCUMENT",
        details={"deleted_filename": doc.filename, "document_id": str(doc.id)}
    )
    db.add(audit)
    
    # Database cascade deletes extracted fields automatically
    db.delete(doc)
    db.commit()
    return None
