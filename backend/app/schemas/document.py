from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.models.document import DocumentCategory, DocumentStatus, FieldValidationStatus


class ExtractedFieldResponse(BaseModel):
    id: UUID
    field_key: str
    extracted_value: str | None = None
    critic_score: float
    auditor_score: float
    consensus_value: str | None = None
    confidence_score: float
    is_modified: bool
    validation_status: FieldValidationStatus
    validation_notes: str | None = None

    class Config:
        from_attributes = True

class DocumentResponse(BaseModel):
    id: UUID
    filename: str
    file_type: str
    category: DocumentCategory
    status: DocumentStatus
    ocr_text: str | None = None
    consensus_score: float | None = None
    uploaded_by: UUID | None = None
    created_at: datetime
    updated_at: datetime
    fields: list[ExtractedFieldResponse] = []

    class Config:
        from_attributes = True

class DocumentSimpleResponse(BaseModel):
    id: UUID
    filename: str
    file_type: str
    category: DocumentCategory
    status: DocumentStatus
    consensus_score: float | None = None
    created_at: datetime
    uploader_name: str | None = None

    class Config:
        from_attributes = True

class FieldUpdate(BaseModel):
    field_key: str
    consensus_value: str

class DocumentReviewSubmit(BaseModel):
    updates: list[FieldUpdate]
