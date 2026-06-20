# Import all models here so SQLAlchemy metadata is aware of them
from app.database import Base
from app.models.auth import User, UserRole
from app.models.document import Document, DocumentStatus, DocumentCategory, ExtractedField, FieldValidationStatus
from app.models.audit import AuditLog
