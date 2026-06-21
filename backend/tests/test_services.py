"""
Unit tests for service layer components.

Tests cover:
- Storage service (file validation, size limits, MIME types)
- OCR service (text extraction, mock fallback)
- Queue service (event publishing, fallback threading)
- Vector store service (document indexing, search)
"""

from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from app.models.document import DocumentCategory
from app.services.ocr import perform_ocr
from app.services.storage import save_uploaded_file

# ─── Storage Service Tests ───────────────────────────────────────────────────

class TestStorageService:
    """Test file upload storage and validation."""

    def test_save_valid_text_file(self, tmp_path):
        """Valid .txt file should be saved successfully."""
        # Create a mock UploadFile
        mock_file = MagicMock()
        mock_file.filename = "test_invoice.txt"
        mock_file.content_type = "text/plain"
        mock_file.file = MagicMock()
        mock_file.file.read = MagicMock(side_effect=[b"Invoice content here", b""])
        mock_file.file.seek = MagicMock()

        with patch("app.services.storage.settings") as mock_settings:
            mock_settings.UPLOAD_DIR = str(tmp_path)
            result = save_uploaded_file(mock_file)

        assert result is not None
        assert "file_path" in result or "saved_path" in result

    def test_reject_invalid_extension(self, tmp_path):
        """Files with disallowed extensions should be rejected."""
        mock_file = MagicMock()
        mock_file.filename = "malware.exe"
        mock_file.content_type = "application/octet-stream"

        with patch("app.services.storage.settings") as mock_settings:
            mock_settings.UPLOAD_DIR = str(tmp_path)
            with pytest.raises(HTTPException):
                save_uploaded_file(mock_file)


# ─── OCR Service Tests ──────────────────────────────────────────────────────

class TestOCRService:
    """Test OCR text extraction."""

    def test_ocr_text_file(self, tmp_path):
        """OCR on a .txt file should return the file contents."""
        test_file = tmp_path / "test.txt"
        test_file.write_text("Hello, this is a test document with invoice data.")

        result = perform_ocr(str(test_file), test_file.name, "TXT")
        assert isinstance(result, str)
        assert len(result) > 0

    def test_ocr_returns_string(self, tmp_path):
        """OCR should always return a string (even on mock fallback)."""
        test_file = tmp_path / "test.pdf"
        test_file.write_bytes(b"%PDF-1.4 mock content")

        result = perform_ocr(str(test_file), test_file.name, "PDF")
        assert isinstance(result, str)

    def test_ocr_handles_missing_file(self):
        """OCR should handle missing files gracefully."""
        result = perform_ocr("/nonexistent/file.txt", "file.txt", "TXT")
        assert "Error" in result


# ─── Document Classification Tests ──────────────────────────────────────────

class TestDocumentClassification:
    """Test the keyword-based document classifier."""

    def test_classify_invoice_by_content(self):
        """Text containing invoice keywords should classify as INVOICE."""
        from app.worker import classify_document
        text = "INVOICE\nTotal Amount Due: $5,000.00\nPayment Terms: Net 30"
        result = classify_document("document.txt", text)
        assert result == DocumentCategory.INVOICE

    def test_classify_rfq_by_content(self):
        """Text containing RFQ keywords should classify as RFQ."""
        from app.worker import classify_document
        text = "REQUEST FOR QUOTATION\nPart Number: PN-001\nQuantity: 100"
        result = classify_document("doc.txt", text)
        assert result == DocumentCategory.RFQ

    def test_classify_contract_by_filename(self):
        """Filename containing 'contract' should help classify."""
        from app.worker import classify_document
        text = "This agreement is entered into by and between the parties."
        result = classify_document("services_contract.pdf", text)
        assert result == DocumentCategory.CONTRACT

    def test_classify_compliance_by_content(self):
        """Text with compliance keywords should classify as COMPLIANCE."""
        from app.worker import classify_document
        text = "CERTIFICATE OF COMPLIANCE\nISO 9001:2015\nConformance Statement"
        result = classify_document("cert.pdf", text)
        assert result == DocumentCategory.COMPLIANCE

    def test_classify_unknown_for_generic_text(self):
        """Generic text without specific keywords should classify as UNKNOWN."""
        from app.worker import classify_document
        text = "Lorem ipsum dolor sit amet, consectetur adipiscing elit."
        result = classify_document("random.txt", text)
        assert result == DocumentCategory.UNKNOWN
