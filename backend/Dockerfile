# ============================================================================
# DocIntel AI Platform - Backend Dockerfile (Multi-Stage)
# ============================================================================
# Stage 1 (builder): Install Python dependencies in an isolated layer
# Stage 2 (runtime): Minimal image with only runtime dependencies
#
# Build:  docker build -t docintel-backend ./backend
# Run:    docker run -p 8000:8000 --env-file .env docintel-backend
# ============================================================================

# --------------------------------------------------------------------------
# Stage 1: Builder
# --------------------------------------------------------------------------
FROM python:3.11-slim AS builder

# Prevent Python from writing .pyc files and enable unbuffered output
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /build

# Install system dependencies required for building Python packages
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        libpq-dev \
        curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies into a virtual environment for clean copying
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy only requirements first to leverage Docker layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip setuptools wheel \
    && pip install --no-cache-dir -r requirements.txt

# --------------------------------------------------------------------------
# Stage 2: Runtime
# --------------------------------------------------------------------------
FROM python:3.11-slim AS runtime

# Labels for container metadata
LABEL maintainer="Aaditya Uniyal" \
      org.opencontainers.image.title="DocIntel Backend" \
      org.opencontainers.image.description="FastAPI backend for the DocIntel AI platform" \
      org.opencontainers.image.source="https://github.com/AadityaUniyal/Googi"

# Prevent Python from writing .pyc files and enable unbuffered output
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    # Ensure the virtualenv is on PATH
    PATH="/opt/venv/bin:$PATH"

# Install minimal runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
        libpq5 \
        curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user for security
RUN groupadd --gid 1000 appuser \
    && useradd --uid 1000 --gid appuser --shell /bin/bash --create-home appuser

WORKDIR /app

# Copy the virtual environment from the builder stage
COPY --from=builder /opt/venv /opt/venv

# Copy application code
COPY --chown=appuser:appuser . .

# Create directory for uploaded documents (if needed)
RUN mkdir -p /app/uploads && chown appuser:appuser /app/uploads

# Switch to non-root user
USER appuser

# Expose the API port
EXPOSE 8000

# Health check - verify the API is responding
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl --fail http://localhost:8000/health || exit 1

# Run the FastAPI application with Uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
