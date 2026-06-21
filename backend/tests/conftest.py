"""
Test configuration and shared fixtures.

Provides a test database (SQLite in-memory), mock settings,
FastAPI test client, and authenticated user fixtures.
"""

import os
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Override settings BEFORE importing app modules
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["JWT_SECRET_KEY"] = "test-secret-key-for-testing-only"
os.environ["GEMINI_API_KEY"] = ""
os.environ["RABBITMQ_HOST"] = "localhost"
os.environ["REDIS_HOST"] = "localhost"
os.environ["DEBUG"] = "true"

import app.database as app_db
from app.database import Base, get_db
from app.main import app

# In-memory SQLite for tests
TEST_ENGINE = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=TEST_ENGINE)
app_db.SessionLocal = TestSessionLocal


def override_get_db():
    """Dependency override for test database."""
    db = TestSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(scope="session", autouse=True)
def setup_test_db():
    """Create all tables once for the test session."""
    Base.metadata.create_all(bind=TEST_ENGINE)
    yield
    Base.metadata.drop_all(bind=TEST_ENGINE)


@pytest.fixture(autouse=True)
def override_dependencies():
    """Override FastAPI dependencies for testing."""
    app.dependency_overrides[get_db] = override_get_db
    yield
    app.dependency_overrides.clear()


@pytest.fixture
def client():
    """FastAPI test client."""
    return TestClient(app)


@pytest.fixture
def db_session():
    """Direct database session for test setup/assertions."""
    session = TestSessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


@pytest.fixture
def mock_redis():
    """Mock Redis client that simulates SET NX EX behavior."""
    mock = MagicMock()
    _store = {}

    def mock_set(key, value, nx=False, ex=None):
        if nx and key in _store:
            return False
        _store[key] = value
        return True

    def mock_get(key):
        return _store.get(key)

    def mock_delete(key):
        _store.pop(key, None)
        return 1

    mock.set = mock_set
    mock.get = mock_get
    mock.delete = mock_delete
    return mock


@pytest.fixture
def registered_user(client):
    """Register and return a test user with credentials."""
    user_data = {
        "email": "test@docintel.ai",
        "password": "TestPassword123!",
        "full_name": "Test Engineer",
        "role": "ADMIN"
    }
    response = client.post("/api/auth/register", json=user_data)
    return {**user_data, "response": response}


@pytest.fixture
def auth_token(client, registered_user):
    """Get a valid auth token for the test user."""
    response = client.post("/api/auth/login", json={
        "email": registered_user["email"],
        "password": registered_user["password"]
    })
    data = response.json()
    return data.get("access_token", "")


@pytest.fixture
def auth_headers(auth_token):
    """Authorization headers for authenticated requests."""
    return {"Authorization": f"Bearer {auth_token}"}


@pytest.fixture
def sample_document_text():
    """Sample OCR text for testing."""
    return """APEX MANUFACTURING CORP.
Invoice Number: INV-2026-00847
Date: June 18, 2026
Bill To: Stellar Dynamics Inc.

Item Description         Qty    Unit Price    Total
Titanium Alloy Rods      50     $75.50        $3,775.00

Subtotal: $3,775.00
Tax (8.25%): $311.44
Shipping: $50.00
Total Amount Due: $4,136.44

Payment Terms: Net 30 via Wire Transfer
"""


@pytest.fixture
def sample_upload_file(tmp_path):
    """Create a temporary text file for upload testing."""
    file_path = tmp_path / "test_invoice.txt"
    file_path.write_text("""APEX MANUFACTURING CORP.
Invoice Number: INV-2026-00847
Date: June 18, 2026
Subtotal: $3,775.00
Tax (8.25%): $311.44
Shipping: $50.00
Total Amount Due: $4,136.44
Payment Terms: Net 30 via Wire Transfer
""")
    return file_path
