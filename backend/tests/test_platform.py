from app.agents.auditor import run_auditor_agent
from app.models.document import DocumentCategory
from app.routes.auth import get_password_hash, verify_password
from app.worker import classify_document


def test_password_hashing():
    password = "secure_internship_test_123"
    hashed = get_password_hash(password)

    assert hashed != password
    assert verify_password(password, hashed) is True
    assert verify_password("wrong_password", hashed) is False

def test_document_classification():
    text_invoice = "APEX CORP INVOICE\nTotal Amount Due: $1,250.00\nDate: 06/18/2026"
    cat_invoice = classify_document("doc1.png", text_invoice)
    assert cat_invoice == DocumentCategory.INVOICE

    text_rfq = "REQUEST FOR QUOTATION (RFQ)\nPart Number: PN-BRK-99\nQty: 500"
    cat_rfq = classify_document("rfq_file.txt", text_rfq)
    assert cat_rfq == DocumentCategory.RFQ

    text_contract = "This Master Services Agreement is entered into..."
    cat_contract = classify_document("stellar_contract_draft.docx", text_contract)
    assert cat_contract == DocumentCategory.CONTRACT

def test_auditor_agent_invoice_math():
    # 1. Matching invoice calculation
    fields_match = {
        "subtotal": "3775.00",
        "tax": "311.44",
        "shipping": "50.00",
        "total_amount": "4136.44"
    }

    audit_res_match = run_auditor_agent(DocumentCategory.INVOICE, fields_match)
    for key in fields_match.keys():
        assert audit_res_match[key]["score"] == 1.0
        assert "Audit Verified" in audit_res_match[key]["notes"]

    # 2. Mismatched invoice calculation
    fields_mismatch = {
        "subtotal": "100.00",
        "tax": "10.00",
        "shipping": "10.00",
        "total_amount": "200.00"  # Should be 120.00
    }

    audit_res_mismatch = run_auditor_agent(DocumentCategory.INVOICE, fields_mismatch)
    for key in fields_mismatch.keys():
        assert audit_res_mismatch[key]["score"] == 0.0
        assert "arithmetic" in audit_res_mismatch[key]["notes"].lower()

    # 3. String characters in numbers
    fields_dollar_sign = {
        "subtotal": "$100.00",
        "tax": "$10.00",
        "shipping": "$10.00",
        "total_amount": "$120.00"
    }
    audit_res_dollar = run_auditor_agent(DocumentCategory.INVOICE, fields_dollar_sign)
    for key in fields_dollar_sign.keys():
        assert audit_res_dollar[key]["score"] == 1.0
        assert "Audit Verified" in audit_res_dollar[key]["notes"]
