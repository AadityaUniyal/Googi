"""
Server-Sent Events (SSE) streaming for real-time pipeline status.

Provides real-time document processing updates to the frontend:
  Document uploaded → SSE stream opens →
    "OCR complete (2.3s)" → "Classification: INVOICE" →
    "Agent 1/4 complete" → "Consensus: 91.2%" → "Status: PROCESSED"

Uses Redis Pub/Sub as the event bus between the worker and API server.
"""

import json
import asyncio
from typing import AsyncGenerator
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.config import settings
from app.routes.auth import get_current_user
from app.models.auth import User
from app.logging_config import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/api/streaming", tags=["streaming"])


async def _redis_event_stream(document_id: str) -> AsyncGenerator[str, None]:
    """
    Subscribe to Redis Pub/Sub channel for a specific document
    and yield SSE-formatted events.
    """
    import redis.asyncio as aioredis

    try:
        r = aioredis.Redis(
            host=settings.REDIS_HOST,
            port=settings.REDIS_PORT,
            password=settings.REDIS_PASSWORD,
            decode_responses=True
        )
        pubsub = r.pubsub()
        channel = f"doc:pipeline:{document_id}"
        await pubsub.subscribe(channel)

        # Send initial connection event
        yield f"data: {json.dumps({'stage': 'CONNECTED', 'message': 'Stream connected'})}\n\n"

        # Listen for events with timeout
        timeout_seconds = 300  # 5 minute max stream duration
        start = asyncio.get_event_loop().time()

        async for message in pubsub.listen():
            if asyncio.get_event_loop().time() - start > timeout_seconds:
                yield f"data: {json.dumps({'stage': 'TIMEOUT', 'message': 'Stream timeout'})}\n\n"
                break

            if message["type"] == "message":
                event_data = message["data"]
                yield f"data: {event_data}\n\n"

                # Check if pipeline is complete
                try:
                    parsed = json.loads(event_data)
                    if parsed.get("stage") in ("COMPLETED", "FAILED"):
                        break
                except (json.JSONDecodeError, TypeError):
                    pass

        await pubsub.unsubscribe(channel)
        await r.close()

    except Exception as e:
        logger.warning(f"SSE stream error for doc {document_id}: {e}")
        yield f"data: {json.dumps({'stage': 'ERROR', 'message': 'Stream unavailable — check status via polling'})}\n\n"


async def _fallback_event_stream(document_id: str) -> AsyncGenerator[str, None]:
    """
    Fallback polling-based stream when Redis is unavailable.
    Polls the database for status changes.
    """
    from app.database import SessionLocal
    from app.models.document import Document, DocumentStatus

    yield f"data: {json.dumps({'stage': 'CONNECTED', 'message': 'Stream connected (polling mode)'})}\n\n"

    last_status = None
    max_polls = 60  # Poll for max 5 minutes (every 5s)

    for _ in range(max_polls):
        try:
            db = SessionLocal()
            doc = db.query(Document).filter(Document.id == document_id).first()
            db.close()

            if doc and doc.status.value != last_status:
                last_status = doc.status.value
                event = {
                    "stage": last_status,
                    "message": f"Status: {last_status}",
                    "consensus_score": doc.consensus_score,
                    "category": doc.category.value if doc.category else None,
                }
                yield f"data: {json.dumps(event)}\n\n"

                if last_status in ("PROCESSED", "FAILED"):
                    break

        except Exception:
            pass

        await asyncio.sleep(5)

    yield f"data: {json.dumps({'stage': 'STREAM_END', 'message': 'Stream ended'})}\n\n"


@router.get("/documents/{document_id}/stream")
async def stream_document_pipeline(
    document_id: UUID,
    current_user: User = Depends(get_current_user)
):
    """
    SSE endpoint for real-time document processing status.

    Opens a Server-Sent Events stream that pushes pipeline stage
    updates as the document moves through OCR → Classification →
    Agent consensus → Final status.

    The stream auto-closes when processing completes or after 5 minutes.
    """
    # Try Redis-backed streaming, fall back to polling
    try:
        import redis as redis_lib
        r = redis_lib.Redis(
            host=settings.REDIS_HOST,
            port=settings.REDIS_PORT,
            socket_timeout=2
        )
        r.ping()
        r.close()
        stream_generator = _redis_event_stream(str(document_id))
    except Exception:
        stream_generator = _fallback_event_stream(str(document_id))

    return StreamingResponse(
        stream_generator,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        }
    )


def publish_pipeline_event(document_id: str, stage: str, message: str, **extra):
    """
    Publish a pipeline stage event to Redis Pub/Sub.
    Called from worker.py at each processing stage.

    Args:
        document_id: UUID of the document being processed
        stage: Pipeline stage name (OCR, CLASSIFY, AGENT_1, CONSENSUS, etc.)
        message: Human-readable status message
        **extra: Additional data (duration_ms, score, category, etc.)
    """
    try:
        import redis as redis_lib
        r = redis_lib.Redis(
            host=settings.REDIS_HOST,
            port=settings.REDIS_PORT,
            socket_timeout=2
        )
        channel = f"doc:pipeline:{document_id}"
        event = {"stage": stage, "message": message, **extra}
        r.publish(channel, json.dumps(event))
        r.close()
    except Exception:
        pass  # Non-critical — SSE is best-effort
