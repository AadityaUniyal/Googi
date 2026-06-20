import enum
import uuid
from sqlalchemy import Column, String, Enum, DateTime, ForeignKey, Float, Text, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base

class DocumentStatus(str, enum.Enum):
    INGESTED = "INGESTED"
    PROCESSING = "PROCESSING"
    FAILED = "FAILED"
    AWAITING_REVIEW = "AWAITING_REVIEW"
    PROCESSED = "PROCESSED"

class DocumentCategory(str, enum.Enum):
    INVOICE = "INVOICE"
    RFQ = "RFQ"
    PURCHASE_ORDER = "PURCHASE_ORDER"
    CONTRACT = "CONTRACT"
    COMPLIANCE = "COMPLIANCE"
    UNKNOWN = "UNKNOWN"

class FieldValidationStatus(str, enum.Enum):
    VALID = "VALID"
    FLAGGED = "FLAGGED"
    MANUAL_CORRECTION = "MANUAL_CORRECTION"

class Document(Base):
    __tablename__ = "documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    filename = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    file_type = Column(String, nullable=False)
    category = Column(Enum(DocumentCategory), default=DocumentCategory.UNKNOWN, nullable=False)
    status = Column(Enum(DocumentStatus), default=DocumentStatus.INGESTED, nullable=False)
    ocr_text = Column(Text, nullable=True)
    consensus_score = Column(Float, nullable=True)
    
    uploaded_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    uploader = relationship("User", backref="uploaded_documents")
    fields = relationship("ExtractedField", back_populates="document", cascade="all, delete-orphan")

class ExtractedField(Base):
    __tablename__ = "extracted_fields"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id = Column(UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    field_key = Column(String, nullable=False)
    extracted_value = Column(String, nullable=True)
    critic_score = Column(Float, default=1.0)
    auditor_score = Column(Float, default=1.0)
    consensus_value = Column(String, nullable=True)
    confidence_score = Column(Float, default=1.0)
    is_modified = Column(Boolean, default=False)
    validation_status = Column(Enum(FieldValidationStatus), default=FieldValidationStatus.VALID, nullable=False)
    validation_notes = Column(Text, nullable=True)

    # Relationships
    document = relationship("Document", back_populates="fields")
