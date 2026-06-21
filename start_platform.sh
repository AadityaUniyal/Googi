#!/usr/bin/env bash
# ============================================================================
# DocIntel AI Platform - Development Launcher (Linux / macOS)
# ============================================================================
# Starts all platform services for local development:
#   1. Infrastructure (RabbitMQ + Redis via Docker Compose)
#   2. FastAPI backend API server
#   3. Document processing worker
#   4. Next.js frontend dev server
#
# Usage:
#   chmod +x start_platform.sh
#   ./start_platform.sh
#
# Press Ctrl+C to gracefully stop all services.
# ============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Colors & Helpers
# ---------------------------------------------------------------------------
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; }

# Track child PIDs for cleanup
BACKEND_PID=""
WORKER_PID=""
FRONTEND_PID=""

# ---------------------------------------------------------------------------
# Banner
# ---------------------------------------------------------------------------
echo -e "${CYAN}${BOLD}"
echo "========================================"
echo "   DocIntel AI Platform Launcher"
echo "========================================"
echo -e "${NC}"

# ---------------------------------------------------------------------------
# Prerequisite Checks
# ---------------------------------------------------------------------------
info "Checking prerequisites..."

if ! command -v docker &>/dev/null; then
    error "Docker is required but not installed."
    error "Install from: https://docs.docker.com/get-docker/"
    exit 1
fi

if ! command -v docker-compose &>/dev/null && ! docker compose version &>/dev/null 2>&1; then
    error "docker-compose is required but not installed."
    exit 1
fi

# Detect Python binary
if command -v python3 &>/dev/null; then
    PYTHON=python3
elif command -v python &>/dev/null; then
    PYTHON=python
else
    error "Python 3 is required but not installed."
    exit 1
fi

# Verify Python version is 3.x
PY_VERSION=$($PYTHON --version 2>&1 | grep -oP '\d+\.\d+')
PY_MAJOR=$(echo "$PY_VERSION" | cut -d. -f1)
if [ "$PY_MAJOR" -lt 3 ]; then
    error "Python 3 is required (found Python $PY_VERSION)."
    exit 1
fi

if ! command -v npm &>/dev/null; then
    error "npm is required but not installed."
    error "Install from: https://nodejs.org/"
    exit 1
fi

info "All prerequisites satisfied (Python: $($PYTHON --version 2>&1), npm: $(npm --version))"
echo ""

# ---------------------------------------------------------------------------
# Cleanup Handler
# ---------------------------------------------------------------------------
cleanup() {
    echo ""
    warn "Shutting down all services..."

    # Kill child processes gracefully
    for pid in $BACKEND_PID $WORKER_PID $FRONTEND_PID; do
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null || true
        fi
    done

    # Stop infrastructure
    docker-compose down 2>/dev/null || true

    info "All services stopped. Goodbye!"
    exit 0
}

trap cleanup INT TERM EXIT

# ---------------------------------------------------------------------------
# Step 1: Infrastructure
# ---------------------------------------------------------------------------
echo -e "${GREEN}[1/4] Starting infrastructure (RabbitMQ + Redis)...${NC}"
docker-compose up -d

# Wait for services to become healthy
info "Waiting for infrastructure to be ready..."
sleep 5

# ---------------------------------------------------------------------------
# Step 2: FastAPI Backend
# ---------------------------------------------------------------------------
echo -e "${GREEN}[2/4] Starting FastAPI backend (port 8000)...${NC}"
cd backend
$PYTHON -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!
cd ..
sleep 2

# ---------------------------------------------------------------------------
# Step 3: Document Processing Worker
# ---------------------------------------------------------------------------
echo -e "${GREEN}[3/4] Starting document processing worker...${NC}"
cd backend
$PYTHON -m app.worker &
WORKER_PID=$!
cd ..
sleep 1

# ---------------------------------------------------------------------------
# Step 4: Next.js Frontend
# ---------------------------------------------------------------------------
echo -e "${GREEN}[4/4] Starting Next.js frontend (port 3000)...${NC}"
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo -e "${GREEN}${BOLD}========================================${NC}"
echo -e "${GREEN}${BOLD}  All services started successfully!${NC}"
echo -e "${GREEN}${BOLD}========================================${NC}"
echo ""
echo -e "  ${CYAN}Backend API${NC}  : http://localhost:8000"
echo -e "  ${CYAN}API Docs${NC}     : http://localhost:8000/docs"
echo -e "  ${CYAN}Frontend${NC}     : http://localhost:3000"
echo -e "  ${CYAN}RabbitMQ UI${NC}  : http://localhost:15672  (guest/guest)"
echo ""
echo -e "  ${YELLOW}Press Ctrl+C to stop all services${NC}"
echo ""

# Wait for any child process to exit
wait
