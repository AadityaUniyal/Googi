from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import engine, Base
from app.routes import auth

# Initialize DB tables (SQLAlchemy auto-creation)
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.APP_NAME,
    description="Production-grade Distributed AI Document Intelligence Platform",
    version="1.0.0",
    debug=settings.DEBUG
)

# Enable CORS for Next.js frontend calls
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For dev environment. Restrict in production.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
from app.routes import documents, review, search, analytics

app.include_router(auth.router)
app.include_router(documents.router)
app.include_router(review.router)
app.include_router(search.router)
app.include_router(analytics.router)

@app.get("/")
def health_check():

    return {
        "status": "healthy",
        "app_name": settings.APP_NAME,
        "database_connected": True
    }
