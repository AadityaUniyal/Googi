from datetime import datetime, timedelta

import bcrypt
import jwt
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.auth import User, UserRole
from app.schemas.auth import RefreshTokenRequest, Token, UserCreate, UserLogin, UserResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])

security = HTTPBearer(auto_error=False)

# Token expiry constants
ACCESS_TOKEN_EXPIRE_MINUTES = 15          # Short-lived access token
REFRESH_TOKEN_EXPIRE_DAYS = 7             # Long-lived refresh token

def get_password_hash(password: str) -> str:
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
    except Exception:
        return False

def create_access_token(user: User) -> str:
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode = {
        "sub": str(user.id),
        "email": user.email,
        "role": user.role.value,
        "type": "access",
        "exp": expire
    }
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt

def create_refresh_token(user: User) -> str:
    expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode = {
        "sub": str(user.id),
        "type": "refresh",
        "exp": expire
    }
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt

# Dependency to get current user from token
def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    token: str = Query(None),
    db: Session = Depends(get_db)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    token_str = None
    if credentials:
        token_str = credentials.credentials
    elif token:
        token_str = token

    if not token_str:
        raise credentials_exception

    try:
        payload = jwt.decode(
            token_str,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM]
        )
        user_id: str = payload.get("sub")
        token_type: str = payload.get("type", "access")
        if user_id is None:
            raise credentials_exception
        # Only access tokens are valid for API authentication
        if token_type != "access":
            raise credentials_exception
    except jwt.PyJWTError:
        raise credentials_exception from None

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise credentials_exception
    return user

# Helper dependency creator for RBAC verification
class RoleChecker:
    def __init__(self, allowed_roles: list[UserRole]):
        self.allowed_roles = allowed_roles

    def __call__(self, current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in self.allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"User role '{current_user.role.value}' does not have permission to access this resource. Allowed: {[r.value for r in self.allowed_roles]}",
            )
        return current_user

# Register a user
@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register_user(user_data: UserCreate, db: Session = Depends(get_db)):
    # Check if user email already exists
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email address already exists.",
        )

    # If it is the first user in the database, promote them to ADMIN
    user_count = db.query(User).count()
    assigned_role = UserRole.ADMIN if user_count == 0 else user_data.role

    db_user = User(
        email=user_data.email,
        hashed_password=get_password_hash(user_data.password),
        full_name=user_data.full_name,
        role=assigned_role
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

# Login endpoint
@router.post("/login", response_model=Token)
def login(login_data: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == login_data.email).first()
    if not user or not verify_password(login_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    access_token = create_access_token(user)
    refresh_token = create_refresh_token(user)
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
    }

# Refresh token endpoint — accepts a refresh token, returns new access + refresh tokens (rotation)
@router.post("/refresh", response_model=Token)
def refresh_tokens(body: RefreshTokenRequest, db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired refresh token",
    )
    try:
        payload = jwt.decode(
            body.refresh_token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
        user_id: str = payload.get("sub")
        token_type: str = payload.get("type")
        if user_id is None or token_type != "refresh":
            raise credentials_exception
    except jwt.PyJWTError:
        raise credentials_exception from None

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise credentials_exception

    new_access_token = create_access_token(user)
    new_refresh_token = create_refresh_token(user)
    return {
        "access_token": new_access_token,
        "refresh_token": new_refresh_token,
        "token_type": "bearer",
    }

# Get info of currently logged in user
@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user

