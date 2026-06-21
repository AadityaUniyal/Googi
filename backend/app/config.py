import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional

class Settings(BaseSettings):
    # App General Config
    APP_NAME: str = "Distributed AI Document Intelligence Platform"
    DEBUG: bool = True
    
    # Database Config (set via DATABASE_URL env var or .env file)
    DATABASE_URL: str = "postgresql://user:password@localhost:5432/docintel"
    
    # Security & Auth Config
    JWT_SECRET_KEY: str = ""  # MUST be set via env var — generate with: python -c "import secrets; print(secrets.token_urlsafe(64))"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 Hours
    
    # AI Config
    GEMINI_API_KEY: Optional[str] = None
    
    # Broker & Cache Config
    RABBITMQ_HOST: str = "localhost"
    RABBITMQ_PORT: int = 5672
    RABBITMQ_USER: str = "guest"
    RABBITMQ_PASS: str = "guest"
    
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_PASSWORD: Optional[str] = "devpassword"
    
    # Storage & RAG Directories
    UPLOAD_DIR: str = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "uploads")
    CHROMA_PERSIST_DIR: str = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "chroma_db")
    
    # Enable reading from .env file
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

settings = Settings()

# Ensure directories exist
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
os.makedirs(settings.CHROMA_PERSIST_DIR, exist_ok=True)
