# Contributing to DocIntel AI

Thank you for your interest in contributing to DocIntel AI! This guide will help you get started.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Code Style](#code-style)
- [Making Changes](#making-changes)
- [Testing](#testing)
- [Pull Request Process](#pull-request-process)
- [Commit Message Conventions](#commit-message-conventions)
- [Getting Help](#getting-help)

---

## Prerequisites

Before you begin, ensure you have the following installed:

| Tool       | Version  | Purpose                     |
|------------|----------|-----------------------------|
| Python     | 3.11+    | Backend API & workers       |
| Node.js    | 20+      | Frontend application        |
| Docker     | Latest   | Infrastructure services     |
| Git        | Latest   | Version control             |
| Make       | Latest   | Task automation (optional)  |

## Development Setup

### 1. Fork & Clone

```bash
# Fork the repo on GitHub, then clone your fork
git clone https://github.com/<your-username>/Googi.git
cd Googi
```

### 2. Backend Setup

```bash
cd backend

# Create a virtual environment
python -m venv venv
source venv/bin/activate   # Linux/macOS
# venv\Scripts\activate    # Windows

# Install dependencies
pip install -r requirements.txt
pip install -r requirements-dev.txt  # Dev/test dependencies

# Copy environment file
cp .env.example .env
# Edit .env with your local settings

cd ..
```

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm ci

# Copy environment file
cp .env.example .env.local
# Edit .env.local with your local settings

cd ..
```

### 4. Start Infrastructure

```bash
# Start RabbitMQ and Redis via Docker Compose
docker-compose up -d

# Or use the convenience script
./start_platform.sh        # Linux/macOS
.\start_platform.ps1       # Windows
```

### 5. Run Database Migrations

```bash
cd backend
alembic upgrade head
```

### 6. Verify Everything Works

```bash
make dev    # Start all services
make test   # Run the test suite
```

## Project Structure

```
.
├── backend/              # FastAPI backend
│   ├── app/
│   │   ├── main.py       # Application entry point
│   │   ├── api/          # Route handlers
│   │   ├── core/         # Configuration, security, dependencies
│   │   ├── models/       # SQLAlchemy models
│   │   ├── schemas/      # Pydantic schemas
│   │   ├── services/     # Business logic
│   │   └── worker.py     # Document processing worker
│   ├── tests/            # Backend tests
│   └── alembic/          # Database migrations
├── frontend/             # Next.js 16 frontend
│   ├── src/
│   │   ├── app/          # App router pages
│   │   ├── components/   # React components
│   │   └── lib/          # Utilities and API client
│   └── public/           # Static assets
├── k8s/                  # Kubernetes manifests
├── .github/workflows/    # CI/CD pipelines
└── docker-compose.yml    # Local infrastructure
```

## Code Style

### Python (Backend)

We use **[Ruff](https://docs.astral.sh/ruff/)** for linting and formatting:

```bash
# Check for issues
cd backend && ruff check app/ tests/

# Auto-fix issues
cd backend && ruff check --fix app/ tests/

# Format code
cd backend && ruff format app/ tests/
```

**Key conventions:**
- Follow [PEP 8](https://peps.python.org/pep-0008/) style guidelines
- Use type hints for all function signatures
- Maximum line length: 100 characters
- Use `async def` for all route handlers
- Write docstrings for public functions and classes (Google style)

### TypeScript (Frontend)

We use **ESLint** with the Next.js configuration:

```bash
cd frontend && npm run lint
```

**Key conventions:**
- Use TypeScript strict mode
- Prefer functional components with hooks
- Use `interface` over `type` for object shapes
- Name components with PascalCase, utilities with camelCase
- Co-locate component tests with component files

## Making Changes

### 1. Create a Branch

```bash
# Always branch from an up-to-date main
git checkout main
git pull upstream main
git checkout -b feat/your-feature-name
```

**Branch naming conventions:**
- `feat/description` — New feature
- `fix/description` — Bug fix
- `docs/description` — Documentation only
- `refactor/description` — Code refactoring
- `test/description` — Adding or updating tests
- `chore/description` — Tooling, CI, dependencies

### 2. Make Your Changes

- Write clean, well-documented code
- Add or update tests for your changes
- Update documentation if needed

### 3. Validate Locally

```bash
make lint   # Ensure no linting errors
make test   # Ensure all tests pass
```

## Testing

### Backend Tests

We use **pytest** with async support:

```bash
cd backend

# Run all tests
pytest -v

# Run with coverage
pytest --cov=app --cov-report=term-missing -v

# Run a specific test file
pytest tests/test_documents.py -v

# Run a specific test
pytest tests/test_documents.py::test_upload_document -v
```

**Testing guidelines:**
- Maintain **≥80% code coverage** for all new code
- Write unit tests for services and utilities
- Write integration tests for API endpoints
- Use fixtures for test data and database setup
- Mock external services (Gemini API, RabbitMQ)

### Frontend Tests

```bash
cd frontend

# Run tests
npm test

# Run with coverage
npm run test:coverage
```

## Pull Request Process

1. **Update your branch** with the latest `main`:
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Push your branch** and open a Pull Request on GitHub.

3. **PR requirements:**
   - Descriptive title following [commit conventions](#commit-message-conventions)
   - Detailed description of changes and motivation
   - All CI checks must pass (lint, test, build)
   - At least one approving review from a maintainer
   - No merge conflicts

4. **PR checklist:**
   - [ ] Tests added/updated for the changes
   - [ ] Documentation updated (if applicable)
   - [ ] No new linting warnings
   - [ ] Breaking changes documented (if any)

5. **After approval**, a maintainer will merge your PR using squash merge.

## Commit Message Conventions

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types

| Type       | Description                              |
|------------|------------------------------------------|
| `feat`     | A new feature                            |
| `fix`      | A bug fix                                |
| `docs`     | Documentation only changes               |
| `style`    | Formatting, missing semicolons, etc.     |
| `refactor` | Code change that neither fixes nor adds  |
| `perf`     | Performance improvement                  |
| `test`     | Adding or updating tests                 |
| `build`    | Build system or external dependencies    |
| `ci`       | CI configuration changes                 |
| `chore`    | Other changes that don't modify src/test |

### Examples

```
feat(api): add document search endpoint with full-text search
fix(worker): handle PDF parsing timeout for large documents
docs(readme): update deployment instructions for Kubernetes
test(auth): add integration tests for JWT refresh flow
```

### Breaking Changes

Add `BREAKING CHANGE:` in the footer or `!` after the type:

```
feat(api)!: rename /documents endpoint to /docs

BREAKING CHANGE: The /documents API endpoint has been renamed to /docs.
Update all client references accordingly.
```

## Getting Help

- **Questions?** Open a [Discussion](https://github.com/AadityaUniyal/Googi/discussions)
- **Bug reports?** Open an [Issue](https://github.com/AadityaUniyal/Googi/issues) with the bug template
- **Feature ideas?** Open an [Issue](https://github.com/AadityaUniyal/Googi/issues) with the feature template

---

Thank you for contributing to DocIntel AI! 🚀
