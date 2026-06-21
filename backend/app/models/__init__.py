# Import all models here so SQLAlchemy metadata is aware of them
from app.database import Base
from app.models.audit import AuditLog
from app.models.auth import User, UserRole
from app.models.document import Document, DocumentCategory, DocumentStatus, ExtractedField, FieldValidationStatus
from app.models.search import CrawledPage, PageLink, SearchLog

__all__ = [
    "Base",
    "AuditLog",
    "User",
    "UserRole",
    "Document",
    "DocumentCategory",
    "DocumentStatus",
    "ExtractedField",
    "FieldValidationStatus",
    "CrawledPage",
    "PageLink",
    "SearchLog",
]
