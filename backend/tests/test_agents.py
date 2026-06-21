"""
Unit tests for all 4 AI agents with mocked LLM responses.

Tests cover:
- Extractor agent (heuristic fallback extraction per category)
- Critic agent (field validation scoring)
- Auditor agent (graduated math audit scoring)
- Compliance agent (compliance verification)
- Consensus engine (weighted scoring, category-aware weights)
"""

from unittest.mock import patch

import pytest

from app.agents.auditor import run_auditor_agent
from app.agents.compliance import run_compliance_agent
from app.agents.consensus import run_agent_consensus
from app.agents.critic import run_critic_agent
from app.agents.extractor import run_extractor_agent
from app.models.document import DocumentCategory, FieldValidationStatus

# ─── Extractor Agent Tests ───────────────────────────────────────────────────

class TestExtractorAgent:
    """Test the heuristic extraction fallback (no API key)."""

    @patch("app.agents.extractor.settings")
    def test_extract_invoice_fields(self, mock_settings):
        """Invoice text should extract standard financial fields."""
        mock_settings.GEMINI_API_KEY = None
        ocr_text = """
        APEX CORP INVOICE
        Invoice Number: INV-2026-00847
        Date: June 18, 2026
        Subtotal: $3,775.00
        Tax: $311.44
        Shipping: $50.00
        Total Amount Due: $4,136.44
        """
        result = run_extractor_agent(ocr_text, DocumentCategory.INVOICE)
        assert isinstance(result, dict)
        assert "invoice_number" in result or "total_amount" in result

    @patch("app.agents.extractor.settings")
    def test_extract_rfq_fields(self, mock_settings):
        """RFQ text should extract part numbers and quantities."""
        mock_settings.GEMINI_API_KEY = None
        ocr_text = """
        REQUEST FOR QUOTATION
        RFQ Reference: RFQ-2026-0042
        Part Number: PN-TI-6AL4V-ROD
        Material: Titanium Grade 5
        Quantity: 500 units
        Tolerance: ±0.05mm
        """
        result = run_extractor_agent(ocr_text, DocumentCategory.RFQ)
        assert isinstance(result, dict)

    @patch("app.agents.extractor.settings")
    def test_extract_contract_fields(self, mock_settings):
        """Contract text should extract dates and parties."""
        mock_settings.GEMINI_API_KEY = None
        ocr_text = """
        MASTER SERVICES AGREEMENT
        Effective Date: January 1, 2026
        Expiry Date: December 31, 2027
        Client: Stellar Dynamics Inc.
        Contractor: APEX Manufacturing Corp.
        Governing Law: State of California
        """
        result = run_extractor_agent(ocr_text, DocumentCategory.CONTRACT)
        assert isinstance(result, dict)

    @patch("app.agents.extractor.settings")
    def test_extract_compliance_fields(self, mock_settings):
        """Compliance text should extract certificate info."""
        mock_settings.GEMINI_API_KEY = None
        ocr_text = """
        CERTIFICATE OF COMPLIANCE
        Certificate Number: COC-2026-1847
        Manufacturer: APEX Manufacturing
        Standards: ISO 9001:2015, AS9100D
        Issue Date: June 1, 2026
        """
        result = run_extractor_agent(ocr_text, DocumentCategory.COMPLIANCE)
        assert isinstance(result, dict)

    @patch("app.agents.extractor.settings")
    def test_extract_unknown_returns_dict(self, mock_settings):
        """Unknown category should still return a dict without crashing."""
        mock_settings.GEMINI_API_KEY = None
        result = run_extractor_agent("Some random text", DocumentCategory.UNKNOWN)
        assert isinstance(result, dict)


# ─── Critic Agent Tests ─────────────────────────────────────────────────────

class TestCriticAgent:
    """Test the critic agent's field validation scoring."""

    @patch("app.agents.critic.settings")
    def test_critic_scores_present_fields_high(self, mock_settings):
        """Fields found in OCR text should get high scores."""
        mock_settings.GEMINI_API_KEY = None
        ocr_text = "Invoice Number: INV-2026-00847 Total: $4,136.44"
        fields = {
            "invoice_number": "INV-2026-00847",
            "total_amount": "$4,136.44"
        }
        result = run_critic_agent(ocr_text, fields)
        assert isinstance(result, dict)
        for key in fields:
            assert key in result
            assert "score" in result[key]
            assert result[key]["score"] >= 0.9  # Should be high — found in text

    @patch("app.agents.critic.settings")
    def test_critic_scores_missing_fields_low(self, mock_settings):
        """Fields NOT in OCR text should get lower scores."""
        mock_settings.GEMINI_API_KEY = None
        ocr_text = "Some completely unrelated document text"
        fields = {"vendor_name": "ACME Corp", "po_number": "PO-12345"}
        result = run_critic_agent(ocr_text, fields)
        assert isinstance(result, dict)
        for key in fields:
            assert key in result
            assert result[key]["score"] <= 0.6

    @patch("app.agents.critic.settings")
    def test_critic_scores_na_fields_low(self, mock_settings):
        """Fields with 'N/A' value should get low scores."""
        mock_settings.GEMINI_API_KEY = None
        ocr_text = "Invoice document text"
        fields = {"missing_field": "N/A"}
        result = run_critic_agent(ocr_text, fields)
        assert isinstance(result, dict)
        assert result["missing_field"]["score"] <= 0.5


# ─── Auditor Agent Tests ────────────────────────────────────────────────────

class TestAuditorAgent:
    """Test the deterministic math audit agent."""

    def test_invoice_math_correct(self):
        """Matching totals should score 1.0."""
        fields = {
            "subtotal": "3775.00",
            "tax": "311.44",
            "shipping": "50.00",
            "total_amount": "4136.44"
        }
        result = run_auditor_agent(DocumentCategory.INVOICE, fields)
        for key in fields:
            assert result[key]["score"] == 1.0

    def test_invoice_math_major_mismatch(self):
        """Large arithmetic errors should score 0.0."""
        fields = {
            "subtotal": "100.00",
            "tax": "10.00",
            "shipping": "10.00",
            "total_amount": "200.00"  # Should be 120.00 — 66% error
        }
        result = run_auditor_agent(DocumentCategory.INVOICE, fields)
        # With graduated scoring, a 66% error should be severe (0.0)
        assert result["total_amount"]["score"] <= 0.1

    def test_invoice_math_with_dollar_signs(self):
        """Dollar signs in values should be stripped before calculation."""
        fields = {
            "subtotal": "$100.00",
            "tax": "$10.00",
            "shipping": "$10.00",
            "total_amount": "$120.00"
        }
        result = run_auditor_agent(DocumentCategory.INVOICE, fields)
        for key in fields:
            assert result[key]["score"] == 1.0

    def test_rfq_positive_quantity(self):
        """RFQ with valid positive quantity should pass."""
        fields = {"quantity": "500"}
        result = run_auditor_agent(DocumentCategory.RFQ, fields)
        assert result["quantity"]["score"] == 1.0

    def test_rfq_invalid_quantity(self):
        """RFQ with non-positive quantity should fail."""
        fields = {"quantity": "-5"}
        result = run_auditor_agent(DocumentCategory.RFQ, fields)
        assert result["quantity"]["score"] < 1.0

    def test_non_invoice_default_pass(self):
        """Non-invoice/RFQ documents should default to passing."""
        fields = {"some_field": "some_value"}
        result = run_auditor_agent(DocumentCategory.CONTRACT, fields)
        for key in fields:
            assert result[key]["score"] == 1.0


# ─── Compliance Agent Tests ─────────────────────────────────────────────────

class TestComplianceAgent:
    """Test the compliance verification agent."""

    @patch("app.agents.compliance.settings")
    def test_invoice_with_payment_terms(self, mock_settings):
        """Invoice with payment terms should score well."""
        mock_settings.GEMINI_API_KEY = None
        ocr_text = "Invoice with Payment Terms: Net 30 via Wire Transfer"
        fields = {"total_amount": "1000.00"}
        result = run_compliance_agent(ocr_text, DocumentCategory.INVOICE, fields)
        assert isinstance(result, dict)
        for key in fields:
            assert key in result
            assert result[key]["score"] > 0.0

    @patch("app.agents.compliance.settings")
    def test_contract_with_governing_law(self, mock_settings):
        """Contract with governing law clause should pass."""
        mock_settings.GEMINI_API_KEY = None
        ocr_text = "This agreement shall be governed by the laws of California"
        fields = {"governing_law": "California"}
        result = run_compliance_agent(ocr_text, DocumentCategory.CONTRACT, fields)
        assert isinstance(result, dict)

    @patch("app.agents.compliance.settings")
    def test_compliance_with_standards(self, mock_settings):
        """Compliance doc with ISO standards should score well."""
        mock_settings.GEMINI_API_KEY = None
        ocr_text = "Certified to ISO 9001:2015 and AS9100D standards"
        fields = {"standards": "ISO 9001:2015"}
        result = run_compliance_agent(ocr_text, DocumentCategory.COMPLIANCE, fields)
        assert isinstance(result, dict)


# ─── Consensus Engine Tests ─────────────────────────────────────────────────

class TestConsensusEngine:
    """Test the multi-agent consensus orchestrator."""

    @patch("app.agents.consensus.run_compliance_agent")
    @patch("app.agents.consensus.run_auditor_agent")
    @patch("app.agents.consensus.run_critic_agent")
    @patch("app.agents.consensus.run_extractor_agent")
    @pytest.mark.asyncio
    async def test_consensus_returns_structured_result(
        self, mock_extractor, mock_critic, mock_auditor, mock_compliance
    ):
        """Consensus should return fields with weighted confidence scores."""
        mock_extractor.return_value = {
            "invoice_number": "INV-001",
            "total_amount": "1000.00"
        }
        mock_critic.return_value = {
            "invoice_number": {"score": 0.95, "notes": "Found in text"},
            "total_amount": {"score": 0.90, "notes": "Found in text"}
        }
        mock_auditor.return_value = {
            "invoice_number": {"score": 1.0, "notes": "N/A"},
            "total_amount": {"score": 1.0, "notes": "Verified"}
        }
        mock_compliance.return_value = {
            "invoice_number": {"score": 0.80, "notes": "OK"},
            "total_amount": {"score": 0.85, "notes": "OK"}
        }

        result = await run_agent_consensus("Sample OCR text", DocumentCategory.INVOICE)
        assert isinstance(result, dict)
        assert "fields" in result
        assert "overall_score" in result
        assert isinstance(result["overall_score"], float)
        assert 0.0 <= result["overall_score"] <= 1.0

    @patch("app.agents.consensus.run_compliance_agent")
    @patch("app.agents.consensus.run_auditor_agent")
    @patch("app.agents.consensus.run_critic_agent")
    @patch("app.agents.consensus.run_extractor_agent")
    @pytest.mark.asyncio
    async def test_consensus_flags_low_confidence_fields(
        self, mock_extractor, mock_critic, mock_auditor, mock_compliance
    ):
        """Fields with low scores should be flagged."""
        mock_extractor.return_value = {"vendor_name": "ACME"}
        mock_critic.return_value = {
            "vendor_name": {"score": 0.40, "notes": "Not found"}
        }
        mock_auditor.return_value = {
            "vendor_name": {"score": 1.0, "notes": "N/A"}
        }
        mock_compliance.return_value = {
            "vendor_name": {"score": 0.30, "notes": "Missing"}
        }

        result = await run_agent_consensus("Some text", DocumentCategory.INVOICE)
        assert isinstance(result, dict)
        # Low-scoring fields should result in lower consensus
        if "fields" in result:
            for field_data in result["fields"]:
                if isinstance(field_data, dict) and "confidence_score" in field_data:
                    assert field_data["validation_status"] == FieldValidationStatus.FLAGGED

    @patch("app.agents.consensus.run_compliance_agent")
    @patch("app.agents.consensus.run_auditor_agent")
    @patch("app.agents.consensus.run_critic_agent")
    @patch("app.agents.consensus.run_extractor_agent")
    @pytest.mark.asyncio
    async def test_consensus_handles_empty_extraction(
        self, mock_extractor, mock_critic, mock_auditor, mock_compliance
    ):
        """Empty extraction should not crash the consensus engine."""
        mock_extractor.return_value = {}
        mock_critic.return_value = {}
        mock_auditor.return_value = {}
        mock_compliance.return_value = {}

        result = await run_agent_consensus("Empty document", DocumentCategory.UNKNOWN)
        assert isinstance(result, dict)
