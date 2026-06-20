import os
import uuid
from fastapi import UploadFile, HTTPException, status
from app.config import settings

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt", ".png", ".jpg", ".jpeg", ".tiff"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB limit

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
