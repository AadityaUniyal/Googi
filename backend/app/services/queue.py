import pika
import json
import logging
import threading
from app.config import settings

logger = logging.getLogger(__name__)

# Registry for synchronous/local worker fallback callback
_local_worker_callback = None

def register_local_worker_callback(callback):
    global _local_worker_callback
    _local_worker_callback = callback

def get_rabbitmq_connection():
    credentials = pika.PlainCredentials(settings.RABBITMQ_USER, settings.RABBITMQ_PASS)
    parameters = pika.ConnectionParameters(
        host=settings.RABBITMQ_HOST,
        port=settings.RABBITMQ_PORT,
        credentials=credentials,
        connection_attempts=1,
        retry_delay=1
    )
    return pika.BlockingConnection(parameters)

def publish_document_event(event_type: str, document_id: str):
    payload = {
        "event_type": event_type,
        "document_id": str(document_id)
    }
    message = json.dumps(payload)
    
    try:
        connection = get_rabbitmq_connection()
        channel = connection.channel()
        
        # Declare queue
        channel.queue_declare(queue="document_processing_queue", durable=True)
        
        # Publish persistent message
        channel.basic_publish(
            exchange="",
            routing_key="document_processing_queue",
            body=message,
            properties=pika.BasicProperties(
                delivery_mode=2,  # Make message persistent
            )
        )
        connection.close()
        logger.info(f"Published event '{event_type}' for document {document_id} to RabbitMQ")
        
    except Exception as e:
        logger.warning(
            f"RabbitMQ is unavailable (Connection failed: {str(e)}). "
            f"Falling back to local in-process thread execution for event '{event_type}' on document {document_id}."
        )
        
        # Trigger local thread worker fallback if registered
        if _local_worker_callback:
            thread = threading.Thread(
                target=_local_worker_callback,
                args=(document_id,),
                daemon=True
            )
            thread.start()
        else:
            logger.error("No local worker callback registered. Event dropped.")
