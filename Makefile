# ============================================================================
# DocIntel AI Platform - Makefile
# ============================================================================
# Cross-platform development automation. Works on Linux, macOS, and Windows
# (via Git Bash, WSL, or Make for Windows).
#
# Usage:
#   make dev       - Start all services for local development
#   make test      - Run the full test suite with coverage
#   make lint      - Run linters (ruff + eslint)
#   make build     - Build production Docker images
#   make stop      - Stop all running services
#   make clean     - Stop services and remove all generated artifacts
#   make migrate   - Run database migrations
#   make migration msg="description" - Create a new migration
# ============================================================================

.PHONY: dev test lint build stop clean migrate migration help

# Detect OS for cross-platform compatibility
ifeq ($(OS),Windows_NT)
    PYTHON ?= python
    RM_PYCACHE = powershell -Command "Get-ChildItem -Path backend -Recurse -Directory -Filter __pycache__ | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue"
    RM_NEXT = powershell -Command "Remove-Item -Path frontend\.next -Recurse -Force -ErrorAction SilentlyContinue"
    SLEEP = timeout /t 3 /nobreak >nul
else
    PYTHON ?= python3
    RM_PYCACHE = find backend -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
    RM_NEXT = rm -rf frontend/.next
    SLEEP = sleep 3
endif

# Default target
.DEFAULT_GOAL := help

## help: Show this help message
help:
	@echo "============================================"
	@echo "  DocIntel AI Platform - Available Commands"
	@echo "============================================"
	@echo ""
	@echo "  make dev        Start all services for development"
	@echo "  make test       Run the full test suite with coverage"
	@echo "  make lint       Run linters (ruff + eslint)"
	@echo "  make build      Build Docker images"
	@echo "  make stop       Stop all running services"
	@echo "  make clean      Stop services and remove artifacts"
	@echo "  make migrate    Run database migrations (Alembic)"
	@echo "  make migration  Create new migration (msg=...)"
	@echo ""

## dev: Start all services for local development
dev:
	@echo "Starting DocIntel AI Platform (development mode)..."
	docker-compose up -d
	@$(SLEEP)
	cd backend && $(PYTHON) -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &
	cd backend && $(PYTHON) -m app.worker &
	cd frontend && npm run dev &
	@echo ""
	@echo "All services started:"
	@echo "  Backend API : http://localhost:8000"
	@echo "  Frontend    : http://localhost:3000"
	@echo "  RabbitMQ UI : http://localhost:15672"

## test: Run the full test suite with coverage
test:
	@echo "Running backend tests..."
	cd backend && $(PYTHON) -m pytest --cov=app --cov-report=term-missing --cov-report=html:htmlcov -v

## lint: Run all linters
lint:
	@echo "Linting backend (ruff)..."
	cd backend && $(PYTHON) -m ruff check app/ tests/
	@echo "Linting frontend (eslint)..."
	cd frontend && npm run lint

## build: Build production Docker images
build:
	@echo "Building Docker images..."
	docker build -t docintel-backend:latest ./backend
	docker build -t docintel-frontend:latest ./frontend
	@echo "Build complete."

## stop: Stop all running services
stop:
	@echo "Stopping services..."
	docker-compose down

## clean: Stop services and remove all generated artifacts
clean:
	@echo "Cleaning up..."
	docker-compose down -v
	$(RM_PYCACHE)
	$(RM_NEXT)
	@echo "Clean complete."

## migrate: Run pending database migrations
migrate:
	@echo "Running database migrations..."
	cd backend && $(PYTHON) -m alembic upgrade head

## migration: Create a new database migration (usage: make migration msg="add users table")
migration:
ifndef msg
	$(error Usage: make migration msg="migration description")
endif
	cd backend && $(PYTHON) -m alembic revision --autogenerate -m "$(msg)"
