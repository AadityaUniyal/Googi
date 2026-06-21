import enum
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, Enum, String

from app.database import GUID, Base


class UserRole(enum.StrEnum):
    ADMIN = "ADMIN"
    REVIEWER = "REVIEWER"
    OPERATOR = "OPERATOR"
    VIEWER = "VIEWER"

class User(Base):
    __tablename__ = "users"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=False)
    role = Column(Enum(UserRole), default=UserRole.VIEWER, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
