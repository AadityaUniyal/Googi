import os
import uuid
import logging
from fastapi import UploadFile, HTTPException, status
from app.config import settings

logger = logging.getLogger(__name__)

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt", ".png", ".jpg", ".jpeg", ".tiff"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB limit

# Mapping from MIME types to allowed extensions
_MIME_TO_EXTENSIONS = {
    "application/pdf": {".pdf"},
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {".docx"},
    "text/plain": {".txt"},
    "image/png": {".png"},
    "image/jpeg": {".jpg", ".jpeg"},
    "image/tiff": {".tiff"},
}

# Magic number signatures for manual fallback MIME detection
_FILE_SIGNATURES = [
    (b"%PDF", "application/pdf"),
    (b"PK\x03\x04", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),  # ZIP-based (docx)
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"II\x2a\x00", "image/tiff"),  # Little-endian TIFF
    (b"MM\x00\x2a", "image/tiff"),  # Big-endian TIFF
]

# Try to import python-magic for robust MIME detection; degrade gracefully
_magic_available = False
try:
    import magic as _magic
    _magic_available = True
except ImportError:
    _magic = None
    logger.info("python-magic not installed — falling back to file header signature detection for MIME validation.")


def _detect_mime_from_path(file_path: str) -> str | None:
    """Detect MIME type from file content using python-magic or manual header signatures."""
    if _magic_available:
        try:
            return _magic.from_file(file_path, mime=True)
        except Exception as e:
            logger.warning(f"python-magic detection failed: {e}. Falling back to header signatures.")

    # Manual fallback: read first 16 bytes and match against known signatures
    try:
        with open(file_path, "rb") as f:
            header = f.read(16)
        for sig, mime_type in _FILE_SIGNATURES:
            if header.startswith(sig):
                return mime_type
    except Exception:
        pass

    return None


def _validate_mime_type(file_path: str, extension: str) -> None:
    """
    Validate that the actual file content matches the claimed extension.
    Raises HTTPException if a mismatch is detected.
    """
    # Skip MIME validation for plain text — magic detection is unreliable for .txt
    if extension == ".txt":
        return

    detected_mime = _detect_mime_from_path(file_path)
    if detected_mime is None:
        # Could not detect — allow but log a warning
        logger.warning(f"Could not detect MIME type for {file_path}. Allowing upload based on extension alone.")
        return

    # Check if the detected MIME type allows the claimed extension
    allowed_exts = _MIME_TO_EXTENSIONS.get(detected_mime)
    if allowed_exts is not None and extension not in allowed_exts:
        # Clean up the file before raising
        try:
            os.remove(file_path)
        except OSError:
            pass
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"MIME type mismatch: file content detected as '{detected_mime}' "
                f"but extension is '{extension}'. Upload rejected."
            ),
        )


def save_uploaded_file(file: UploadFile) -> dict:
    # Validate extension
    _, ext = os.path.splitext(file.filename)
    ext = ext.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File extension '{ext}' is not supported. Allowed formats: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    # Prepare unique filename
    unique_filename = f"{uuid.uuid4()}{ext}"
    dest_path = os.path.join(settings.UPLOAD_DIR, unique_filename)

    # Save content and validate size
    size = 0
    try:
        with open(dest_path, "wb") as buffer:
            while chunk := file.file.read(8192):
                size += len(chunk)
                if size > MAX_FILE_SIZE:
                    # Clean up file and abort
                    buffer.close()
                    os.remove(dest_path)
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail=f"File size exceeds the maximum limit of {MAX_FILE_SIZE / (1024 * 1024)} MB."
                    )
                buffer.write(chunk)
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save file: {str(e)}"
        )

    # Validate MIME type matches the claimed extension
    _validate_mime_type(dest_path, ext)

    return {
        "filename": file.filename,
        "saved_filename": unique_filename,
        "file_path": dest_path,
        "file_type": ext.replace(".", "").upper(),
        "size_bytes": size
    }

def delete_stored_file(file_path: str):
    if os.path.exists(file_path):
        try:
            os.remove(file_path)
        except Exception:
            pass

