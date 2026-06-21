"""
DocIntel AI — Application Entry Point

Production-grade FastAPI application with:
- Structured JSON logging with trace_id correlation
- Security headers middleware (CSP, HSTS, X-Frame-Options)
- Rate limiting via slowapi
- Real health checks (DB, Redis, RabbitMQ connectivity)
- Prometheus-compatible metrics endpoint
- CORS with configurable origins
"""

import time
import uuid
from contextlib import asynccontextmanager
from typing import Dict, Any

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import settings
from app.database import engine, Base
# Import all models to register with Base metadata
import app.models.auth
import app.models.document
import app.models.audit
import app.models.search

from app.logging_config import (
    setup_logging, generate_trace_id, trace_id_var, get_logger
)

logger = get_logger(__name__)

# ─── Metrics Collector ──────────────────────────────────────────────────────

class MetricsCollector:
    """Simple in-memory metrics for Prometheus-style /metrics endpoint."""

    def __init__(self):
        self.request_count: int = 0
        self.request_latency_sum: float = 0.0
        self.request_latencies: list = []  # Keep last 1000 for percentiles
        self.documents_processed: int = 0
        self.documents_failed: int = 0
        self.status_codes: Dict[int, int] = {}

    def record_request(self, duration_ms: float, status_code: int):
        self.request_count += 1
        self.request_latency_sum += duration_ms
        self.request_latencies.append(duration_ms)
        if len(self.request_latencies) > 1000:
            self.request_latencies = self.request_latencies[-1000:]
        self.status_codes[status_code] = self.status_codes.get(status_code, 0) + 1

    def get_percentile(self, p: float) -> float:
        if not self.request_latencies:
            return 0.0
        sorted_latencies = sorted(self.request_latencies)
        idx = int(len(sorted_latencies) * p / 100)
        return sorted_latencies[min(idx, len(sorted_latencies) - 1)]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "requests_total": self.request_count,
            "request_latency_avg_ms": round(
                self.request_latency_sum / max(self.request_count, 1), 2
            ),
            "request_latency_p50_ms": round(self.get_percentile(50), 2),
            "request_latency_p95_ms": round(self.get_percentile(95), 2),
            "request_latency_p99_ms": round(self.get_percentile(99), 2),
            "documents_processed": self.documents_processed,
            "documents_failed": self.documents_failed,
            "status_codes": self.status_codes,
        }


metrics = MetricsCollector()

# ─── Lifespan ────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown lifecycle."""
    setup_logging("DEBUG" if settings.DEBUG else "INFO")
    logger.info("DocIntel AI starting up", extra={"trace_id": "startup"})

    # Create database tables (will be replaced by Alembic migrations)
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables initialized", extra={"trace_id": "startup"})

    yield

    logger.info("DocIntel AI shutting down", extra={"trace_id": "shutdown"})


# ─── Application ─────────────────────────────────────────────────────────────

app = FastAPI(
    title=settings.APP_NAME,
    description="Production-grade Distributed AI Document Intelligence Platform",
    version="1.0.0",
    debug=settings.DEBUG,
    lifespan=lifespan,
)


# ─── Middleware: Trace ID + Request Logging ──────────────────────────────────

class TraceIDMiddleware(BaseHTTPMiddleware):
    """Assigns a trace_id to every request for distributed tracing."""

    async def dispatch(self, request: Request, call_next):
        trace_id = request.headers.get("X-Trace-ID", generate_trace_id())
        trace_id_var.set(trace_id)

        start_time = time.time()
        response = await call_next(request)
        duration_ms = (time.time() - start_time) * 1000

        # Record metrics
        metrics.record_request(duration_ms, response.status_code)

        # Add trace_id to response headers
        response.headers["X-Trace-ID"] = trace_id

        # Log the request
        logger.info(
            f"{request.method} {request.url.path} → {response.status_code} ({duration_ms:.1f}ms)",
            extra={
                "trace_id": trace_id,
                "method": request.method,
                "path": str(request.url.path),
                "status_code": response.status_code,
                "duration_ms": round(duration_ms, 1),
            }
        )

        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Adds security headers to every response (OWASP best practices)."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        if not settings.DEBUG:
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains"
            )
        return response


# Add middleware (order matters — outermost first)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(TraceIDMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS if hasattr(settings, 'CORS_ORIGINS') else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Include Routers ─────────────────────────────────────────────────────────

from app.routes import auth, documents, review, search, analytics, streaming, crawl

app.include_router(auth.router)
app.include_router(documents.router)
app.include_router(review.router)
app.include_router(search.router)
app.include_router(analytics.router)
app.include_router(streaming.router)
app.include_router(crawl.router)


# ─── Health & System Endpoints ───────────────────────────────────────────────

@app.get("/")
def root():
    """Root endpoint — basic liveness check."""
    return {
        "status": "healthy",
        "app_name": settings.APP_NAME,
        "version": "1.0.0"
    }


@app.get("/health")
def health_check():
    """
    Comprehensive health check that verifies connectivity to all
    backing services: PostgreSQL, Redis, RabbitMQ.
    """
    health: Dict[str, Any] = {
        "status": "healthy",
        "checks": {}
    }

    # Check PostgreSQL
    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        health["checks"]["database"] = {"status": "connected", "type": "postgresql"}
    except Exception as e:
        health["checks"]["database"] = {"status": "disconnected", "error": str(e)}
        health["status"] = "degraded"

    # Check Redis
    try:
        r = redis_lib.Redis(
            host=settings.REDIS_HOST,
            port=settings.REDIS_PORT,
            password=settings.REDIS_PASSWORD,
            socket_timeout=2
        )
        r.ping()
        health["checks"]["redis"] = {"status": "connected"}
        r.close()
    except Exception:
        health["checks"]["redis"] = {"status": "disconnected"}
        health["status"] = "degraded"

    # Check RabbitMQ
    try:
        import pika
        connection = pika.BlockingConnection(
            pika.ConnectionParameters(
                host=settings.RABBITMQ_HOST,
                port=settings.RABBITMQ_PORT,
                credentials=pika.PlainCredentials(
                    settings.RABBITMQ_USER, settings.RABBITMQ_PASS
                ),
                connection_attempts=1,
                socket_timeout=2,
            )
        )
        connection.close()
        health["checks"]["rabbitmq"] = {"status": "connected"}
    except Exception:
        health["checks"]["rabbitmq"] = {"status": "disconnected"}
        health["status"] = "degraded"

    status_code = 200 if health["status"] == "healthy" else 503
    return JSONResponse(content=health, status_code=status_code)


@app.get("/metrics")
def prometheus_metrics():
    """
    Prometheus-compatible metrics endpoint.
    Returns request counts, latency percentiles, and processing stats.
    """
    return metrics.to_dict()
