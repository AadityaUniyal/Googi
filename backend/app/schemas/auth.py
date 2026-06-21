from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr

from app.models.auth import UserRole


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: UserRole | None = UserRole.VIEWER

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: UUID
    email: EmailStr
    full_name: str
    role: UserRole
    created_at: datetime

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    refresh_token: str | None = None
    token_type: str

class RefreshTokenRequest(BaseModel):
    refresh_token: str

class TokenData(BaseModel):
    email: str | None = None
    role: UserRole | None = None
    user_id: UUID | None = None

