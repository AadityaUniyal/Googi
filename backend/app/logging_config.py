"""
Structured JSON logging with trace_id correlation.

Every request gets a unique trace_id that flows through the entire pipeline:
request → service → agent → worker → database.

This enables distributed tracing and debugging in production.
"""

import logging
import json
import uuid
import sys
from contextvars import ContextVar
from datetime import datetime, timezone

# Context variable for trace_id propagation across async boundaries
trace_id_var: ContextVar[str] = ContextVar("trace_id", default="no-trace")


class JSONFormatter(logging.Formatter):
    """Formats log records as structured JSON with trace_id correlation."""

    def format(self, record: logging.LogRecord) -> str:
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "trace_id": getattr(record, "trace_id", trace_id_var.get("no-trace")),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }

        # Include exception info if present
        if record.exc_info and record.exc_info[0] is not None:
            log_entry["exception"] = self.formatException(record.exc_info)

        # Include any extra fields
        for key in ("document_id", "agent_name", "duration_ms", "status_code",
                     "method", "path", "user_id", "category", "stage"):
            if hasattr(record, key):
                log_entry[key] = getattr(record, key)

        return json.dumps(log_entry)


class TraceIDFilter(logging.Filter):
    """Injects trace_id from context variable into every log record."""

    def filter(self, record: logging.LogRecord) -> bool:
        if not hasattr(record, "trace_id"):
            record.trace_id = trace_id_var.get("no-trace")
        return True


def setup_logging(log_level: str = "INFO") -> None:
    """Configure structured JSON logging for the application."""
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, log_level.upper(), logging.INFO))

    # Remove existing handlers
    root_logger.handlers.clear()

    # JSON handler for structured output
    json_handler = logging.StreamHandler(sys.stdout)
    json_handler.setFormatter(JSONFormatter())
    json_handler.addFilter(TraceIDFilter())
    root_logger.addHandler(json_handler)

    # Suppress noisy third-party loggers
    for logger_name in ("uvicorn.access", "chromadb", "httpx", "pika"):
        logging.getLogger(logger_name).setLevel(logging.WARNING)


def generate_trace_id() -> str:
    """Generate a unique trace ID for request correlation."""
    return str(uuid.uuid4())[:16]


def get_logger(name: str) -> logging.Logger:
    """Get a logger with the trace_id filter already attached."""
    logger = logging.getLogger(name)
    logger.addFilter(TraceIDFilter())
    return logger
