import uuid
from sqlalchemy import Column, String, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base, GUID

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    document_id = Column(GUID, ForeignKey("documents.id", ondelete="SET NULL"), nullable=True)
    user_id = Column(GUID, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action = Column(String, nullable=False)  # e.g., "UPLOAD_DOCUMENT", "FIELD_CORRECTED", "STATUS_CHANGED"
    details = Column(JSON, nullable=True)    # For before/after diffs and event contexts
    timestamp = Column(DateTime, default=datetime.utcnow)

    # Relationships
    document = relationship("Document")
    user = relationship("User")
