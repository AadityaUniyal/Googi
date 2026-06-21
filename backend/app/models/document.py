import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Enum, Float, ForeignKey, String, Text
from sqlalchemy.orm import relationship

from app.database import GUID, Base


class DocumentStatus(enum.StrEnum):
    INGESTED = "INGESTED"
    PROCESSING = "PROCESSING"
    FAILED = "FAILED"
    AWAITING_REVIEW = "AWAITING_REVIEW"
    PROCESSED = "PROCESSED"

class DocumentCategory(enum.StrEnum):
    INVOICE = "INVOICE"
    RFQ = "RFQ"
    PURCHASE_ORDER = "PURCHASE_ORDER"
    CONTRACT = "CONTRACT"
    COMPLIANCE = "COMPLIANCE"
    UNKNOWN = "UNKNOWN"

class FieldValidationStatus(enum.StrEnum):
    VALID = "VALID"
    FLAGGED = "FLAGGED"
    MANUAL_CORRECTION = "MANUAL_CORRECTION"

class Document(Base):
    __tablename__ = "documents"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    filename = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    file_type = Column(String, nullable=False)
    category = Column(Enum(DocumentCategory), default=DocumentCategory.UNKNOWN, nullable=False)
    status = Column(Enum(DocumentStatus), default=DocumentStatus.INGESTED, nullable=False)
    ocr_text = Column(Text, nullable=True)
    consensus_score = Column(Float, nullable=True)
    content_hash = Column(String(64), index=True, nullable=True)

    uploaded_by = Column(GUID, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    uploader = relationship("User", backref="uploaded_documents")
    fields = relationship("ExtractedField", back_populates="document", cascade="all, delete-orphan")

class ExtractedField(Base):
    __tablename__ = "extracted_fields"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    document_id = Column(GUID, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
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
