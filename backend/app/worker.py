import json
import logging
import time
import pika
from sqlalchemy.orm import Session
from app.config import settings
from app.database import SessionLocal
from app.models.document import Document, DocumentStatus, DocumentCategory, ExtractedField
from app.models.audit import AuditLog
from app.services.ocr import perform_ocr
from app.services.vector_store import add_document_to_vector_store
from app.agents.consensus import run_agent_consensus
from app.services.queue import register_local_worker_callback

# Setup logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("worker")

# Retry / DLQ constants
MAX_RETRIES = 3
DLX_EXCHANGE = "document_dlx"
DLQ_QUEUE = "document_processing_dlq"
MAIN_QUEUE = "document_processing_queue"

def classify_document(filename: str, ocr_text: str) -> DocumentCategory:
    """
    Classifies a document based on filename patterns and text content.
    """
    fn = filename.lower()
    text = ocr_text.lower()
    
    if "invoice" in fn or "inv" in fn or "billing" in text or "total amount due" in text:
        return DocumentCategory.INVOICE
    elif "rfq" in fn or "quote" in fn or "request for quotation" in text:
        return DocumentCategory.RFQ
    elif "contract" in fn or "agreement" in fn or "master services agreement" in text or "indemnity" in text:
        return DocumentCategory.CONTRACT
    elif "compliance" in fn or "certificate" in fn or "conformance" in text or "rohs" in text:
        return DocumentCategory.COMPLIANCE
        
    return DocumentCategory.UNKNOWN

def process_document(document_id: str):
    """
    Synchronous processing core for a single document ID.
    Used by both RabbitMQ worker daemon and the threading fallback.
    """
    db: Session = SessionLocal()
    try:
        doc = db.query(Document).filter(Document.id == document_id).first()
        if not doc:
            logger.error(f"Document {document_id} not found in database.")
            return

        logger.info(f"Worker processing document {doc.id} ({doc.filename})...")
        
        # 1. Update status
        doc.status = DocumentStatus.PROCESSING
        db.commit()

        # 2. Perform OCR
        logger.info(f"Extracting text via OCR for {doc.filename}")
        ocr_result = perform_ocr(doc.file_path, doc.filename, doc.file_type)
        doc.ocr_text = ocr_result
        db.commit()

        # 3. Classification
        category = classify_document(doc.filename, ocr_result)
        doc.category = category
        db.commit()
        logger.info(f"Classified document {doc.id} as {category.value}")

        # 4. Run Multi-Agent Consensus Validation
        consensus = run_agent_consensus(ocr_result, category)
        
        # Save Extracted Fields
        # Remove any existing fields first (in case of re-processing)
        db.query(ExtractedField).filter(ExtractedField.document_id == doc.id).delete()
        
        for field in consensus["fields"]:
            db_field = ExtractedField(
                document_id=doc.id,
                field_key=field["field_key"],
                extracted_value=field["extracted_value"],
                critic_score=field["critic_score"],
                auditor_score=field["auditor_score"],
                consensus_value=field["consensus_value"],
                confidence_score=field["confidence_score"],
                is_modified=field["is_modified"],
                validation_status=field["validation_status"],
                validation_notes=field["validation_notes"]
            )
            db.add(db_field)
            
        doc.consensus_score = consensus["overall_score"]
        
        # 5. Check if any fields were FLAGGED or score is low to determine review requirement
        has_flagged_fields = any(f["validation_status"] == "FLAGGED" for f in consensus["fields"])
        
        if consensus["overall_score"] >= 0.85 and not has_flagged_fields:
            doc.status = DocumentStatus.PROCESSED
            logger.info(f"Document {doc.id} approved automatically (Score: {doc.consensus_score:.2%})")
        else:
            doc.status = DocumentStatus.AWAITING_REVIEW
            logger.info(f"Document {doc.id} flagged for human review (Score: {doc.consensus_score:.2%})")
            
        db.commit()

        # 6. Index in Vector Store
        metadata = {
            "filename": doc.filename,
            "category": doc.category.value,
            "status": doc.status.value,
        }
        add_document_to_vector_store(doc.id, ocr_result, metadata)

        # 7. Write Audit Log
        audit = AuditLog(
            document_id=doc.id,
            action="SYSTEM_PROCESSING_COMPLETE",
            details={
                "category": doc.category.value,
                "consensus_score": doc.consensus_score,
                "status": doc.status.value,
                "fields_extracted": len(consensus["fields"])
            }
        )
        db.add(audit)
        db.commit()
        logger.info(f"Successfully finished processing document {doc.id}")

    except Exception as e:
        logger.exception(f"Fatal error while worker processed document {document_id}: {str(e)}")
        # Attempt to set document status as FAILED
        try:
            doc = db.query(Document).filter(Document.id == document_id).first()
            if doc:
                doc.status = DocumentStatus.FAILED
                db.commit()
        except Exception:
            pass
        # Re-raise so that the RabbitMQ callback can handle retries
        raise
    finally:
        db.close()

# Register local thread runner callback in publisher module
register_local_worker_callback(process_document)


def _get_retry_count(properties: pika.BasicProperties) -> int:
    """Extract the x-retry-count from message headers, defaulting to 0."""
    if properties.headers and "x-retry-count" in properties.headers:
        return int(properties.headers["x-retry-count"])
    return 0


def _republish_with_backoff(channel, body: bytes, properties: pika.BasicProperties, retry_count: int):
    """Republish a message with incremented retry count and exponential backoff delay."""
    backoff_seconds = min(2 ** retry_count, 60)  # 1s, 2s, 4s … capped at 60s
    logger.info(f"Retrying message (attempt {retry_count + 1}/{MAX_RETRIES}) after {backoff_seconds}s backoff")
    time.sleep(backoff_seconds)

    new_headers = dict(properties.headers) if properties.headers else {}
    new_headers["x-retry-count"] = retry_count + 1

    channel.basic_publish(
        exchange="",
        routing_key=MAIN_QUEUE,
        body=body,
        properties=pika.BasicProperties(
            delivery_mode=2,
            headers=new_headers,
        ),
    )


def rabbitmq_worker_main():
    """
    Main loop listening to RabbitMQ messages.
    """
    logger.info("Starting RabbitMQ background worker daemon...")
    while True:
        try:
            credentials = pika.PlainCredentials(settings.RABBITMQ_USER, settings.RABBITMQ_PASS)
            parameters = pika.ConnectionParameters(
                host=settings.RABBITMQ_HOST,
                port=settings.RABBITMQ_PORT,
                credentials=credentials,
                heartbeat=600,
                blocked_connection_timeout=300
            )
            connection = pika.BlockingConnection(parameters)
            channel = connection.channel()
            
            # Declare dead-letter exchange & queue
            channel.exchange_declare(exchange=DLX_EXCHANGE, exchange_type="direct", durable=True)
            channel.queue_declare(queue=DLQ_QUEUE, durable=True)
            channel.queue_bind(queue=DLQ_QUEUE, exchange=DLX_EXCHANGE, routing_key=DLQ_QUEUE)

            # Declare main queue with DLX arguments
            channel.queue_declare(
                queue=MAIN_QUEUE,
                durable=True,
                arguments={
                    "x-dead-letter-exchange": DLX_EXCHANGE,
                    "x-dead-letter-routing-key": DLQ_QUEUE,
                },
            )
            channel.basic_qos(prefetch_count=1)
            
            def on_message_callback(ch, method, properties, body):
                retry_count = _get_retry_count(properties)
                try:
                    payload = json.loads(body.decode())
                    doc_id = payload.get("document_id")
                    if doc_id:
                        process_document(doc_id)
                    # Success — acknowledge the message
                    ch.basic_ack(delivery_tag=method.delivery_tag)
                except Exception as e:
                    logger.error(f"Error handling message (retry {retry_count}/{MAX_RETRIES}): {str(e)}")
                    # ACK the current message so it doesn't loop via DLX automatically
                    ch.basic_ack(delivery_tag=method.delivery_tag)
                    if retry_count < MAX_RETRIES:
                        # Republish with incremented retry count and exponential backoff
                        _republish_with_backoff(ch, body, properties, retry_count)
                    else:
                        # Exhausted retries — NACK without requeue to send to DLQ
                        logger.error(f"Max retries ({MAX_RETRIES}) exceeded. Sending message to DLQ.")
                        ch.basic_publish(
                            exchange=DLX_EXCHANGE,
                            routing_key=DLQ_QUEUE,
                            body=body,
                            properties=pika.BasicProperties(
                                delivery_mode=2,
                                headers=dict(properties.headers) if properties.headers else {"x-retry-count": retry_count},
                            ),
                        )
            
            channel.basic_consume(queue=MAIN_QUEUE, on_message_callback=on_message_callback)
            logger.info("Worker daemon connected to RabbitMQ. Listening for messages...")
            channel.start_consuming()
            
        except pika.exceptions.AMQPConnectionError:
            logger.warning("RabbitMQ connection refused. Re-trying in 5 seconds...")
            time.sleep(5)
        except KeyboardInterrupt:
            logger.info("Worker stopped by user request.")
            break
        except Exception as e:
            logger.error(f"Unexpected worker error: {str(e)}. Restarting connection loop in 5 seconds...")
            time.sleep(5)

if __name__ == "__main__":
    rabbitmq_worker_main()

