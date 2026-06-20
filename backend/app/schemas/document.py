from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional
from uuid import UUID
from app.models.document import DocumentStatus, DocumentCategory, FieldValidationStatus

class ExtractedFieldResponse(BaseModel):
    id: UUID
    field_key: str
    extracted_value: Optional[str] = None
    critic_score: float
    auditor_score: float
    consensus_value: Optional[str] = None
    confidence_score: float
    is_modified: bool
    validation_status: FieldValidationStatus
    validation_notes: Optional[str] = None

    class Config:
        from_attributes = True

class DocumentResponse(BaseModel):
    id: UUID
    filename: str
    file_type: str
    category: DocumentCategory
    status: DocumentStatus
    ocr_text: Optional[str] = None
    consensus_score: Optional[float] = None
    uploaded_by: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime
    fields: List[ExtractedFieldResponse] = []

    class Config:
        from_attributes = True

class DocumentSimpleResponse(BaseModel):
    id: UUID
    filename: str
    file_type: str
    category: DocumentCategory
    status: DocumentStatus
    consensus_score: Optional[float] = None
    created_at: datetime
    uploader_name: Optional[str] = None

    class Config:
        from_attributes = True

class FieldUpdate(BaseModel):
    field_key: str
    consensus_value: str

class DocumentReviewSubmit(BaseModel):
    updates: List[FieldUpdate]
