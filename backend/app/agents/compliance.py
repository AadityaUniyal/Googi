import logging
import json
import httpx
from typing import Dict, Any
from app.config import settings
from app.models.document import DocumentCategory

logger = logging.getLogger(__name__)

def run_compliance_agent(ocr_text: str, category: DocumentCategory, extracted_fields: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    """
    Compliance Agent: Validates regulatory and organizational terms.
    Returns: { field_key: { "score": float, "notes": str } }
    """
    if settings.GEMINI_API_KEY:
        try:
            return call_gemini_compliance(ocr_text, category, extracted_fields)
        except Exception as e:
            logger.error(f"Gemini Compliance Agent failed: {str(e)}. Falling back to local compliance.")
            
    return run_local_compliance(ocr_text, category, extracted_fields)

def call_gemini_compliance(ocr_text: str, category: DocumentCategory, extracted_fields: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    prompt = f"""
    You are a Compliance Agent. Your task is to verify if the document complies with standard requirements.
    Review the OCR text and extracted fields for category: {category.value}
    
    Checks:
    - Invoices: presence of payment/wire details or terms.
    - Contracts: governing law present, effective date before expiry date.
    - RFQs: clear part specification and tolerances.
    - Compliance documents: ISO standard compliance mentioned.

    Assign a score between 0.0 (non-compliant) and 1.0 (fully compliant) for each field key.
    Provide a compliance notes explaining any warning or risk.

    Extracted Fields:
    {json.dumps(extracted_fields, indent=2)}

    OCR Text:
    {ocr_text}

    Respond ONLY with a valid JSON block of the format:
    {{
        "field_key": {{
            "score": 1.0,
            "notes": "Complies with regulatory standards"
        }}
    }}
    Do not include markdown code block formatting.
    """
    
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={settings.GEMINI_API_KEY}"
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"responseMimeType": "application/json"}
    }
    
    response = httpx.post(url, json=payload, timeout=30.0)
    response.raise_for_status()
    res_data = response.json()
    
    content_text = res_data["candidates"][0]["content"]["parts"][0]["text"]
    return json.loads(content_text)

def run_local_compliance(ocr_text: str, category: DocumentCategory, extracted_fields: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    compliance = {}
    ocr_lower = ocr_text.lower()
    
    # Pre-populate fields
    for key in extracted_fields.keys():
        compliance[key] = {
            "score": 1.0,
            "notes": "Passed basic compliance checklist."
        }
        
    if category == DocumentCategory.INVOICE:
        # Check if wire transfer, bank, or payment terms are mentioned
        has_terms = any(term in ocr_lower for term in ["wire transfer", "payment terms", "due date", "bank", "net 30", "net 15"])
        if not has_terms:
            note = "Compliance warning: No payment terms or banking transfer instructions detected in document."
            for k in ["total_amount", "invoice_number"]:
                if k in compliance:
                    compliance[k] = {
                        "score": 0.50,
                        "notes": note
                    }
                    
    elif category == DocumentCategory.CONTRACT:
        # Check if Delaware or governing law is mentioned
        has_gov_law = "governing law" in ocr_lower or "laws of" in ocr_lower
        if not has_gov_law:
            if "governing_law" in compliance:
                compliance["governing_law"] = {
                    "score": 0.0,
                    "notes": "Critical Compliance Defect: Governing law clause not found in contract text."
                }
                
    elif category == DocumentCategory.COMPLIANCE:
        # Check if certification standards are listed
        has_iso = "iso" in ocr_lower or "astm" in ocr_lower or "rohs" in ocr_lower
        if not has_iso:
            if "standards" in compliance:
                compliance["standards"] = {
                    "score": 0.50,
                    "notes": "Warning: Standards certificates typically require ASTM or ISO declarations, not found."
                }
                
    return compliance
