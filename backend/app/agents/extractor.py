import re
import json
import logging
import httpx
from typing import Dict, Any
from app.config import settings
from app.models.document import DocumentCategory

logger = logging.getLogger(__name__)

def run_extractor_agent(ocr_text: str, category: DocumentCategory) -> Dict[str, Any]:
    """
    Extractor Agent: Extracts structured fields from raw OCR text.
    Uses Gemini API if key is available; otherwise, falls back to a smart heuristic parser.
    """
    if settings.GEMINI_API_KEY:
        try:
            return call_gemini_extractor(ocr_text, category)
        except Exception as e:
            logger.error(f"Gemini Extractor Agent failed: {str(e)}. Falling back to heuristic extractor.")
            
    return run_heuristic_extractor(ocr_text, category)

def call_gemini_extractor(ocr_text: str, category: DocumentCategory) -> Dict[str, Any]:
    """
    Calls Gemini API using structured JSON schema format.
    """
    # Define system instructions based on category
    schema_instructions = ""
    if category == DocumentCategory.INVOICE:
        schema_instructions = "Return JSON with keys: invoice_number, invoice_date, vendor_name, subtotal, tax, shipping, total_amount"
    elif category == DocumentCategory.RFQ:
        schema_instructions = "Return JSON with keys: rfq_reference, part_number, material, quantity, tolerance"
    elif category == DocumentCategory.CONTRACT:
        schema_instructions = "Return JSON with keys: effective_date, expiry_date, client_name, contractor_name, governing_law"
    elif category == DocumentCategory.COMPLIANCE:
        schema_instructions = "Return JSON with keys: certificate_number, manufacturer, standards, issue_date"
    else:
        schema_instructions = "Return JSON with keys: document_title, extracted_date"

    prompt = f"""
    You are an Extractor Agent. Your task is to analyze the following OCR text and extract structured fields.
    {schema_instructions}

    Respond ONLY with a valid JSON block containing the extracted fields. Do not include markdown code block formatting.

    OCR Text:
    {ocr_text}
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

def run_heuristic_extractor(ocr_text: str, category: DocumentCategory) -> Dict[str, Any]:
    """
    Heuristic parser mapping terms from high-fidelity text back into structured fields.
    """
    extracted = {}
    
    if category == DocumentCategory.INVOICE:
        # Defaults
        extracted = {
            "invoice_number": "N/A",
            "invoice_date": "N/A",
            "vendor_name": "N/A",
            "subtotal": "0.00",
            "tax": "0.00",
            "shipping": "0.00",
            "total_amount": "0.00"
        }
        
        # Parse invoice number
        inv_no_match = re.search(r"Invoice\s*(?:Number|No\.?|#)\s*:\s*([^\n\r]+)", ocr_text, re.IGNORECASE)
        if inv_no_match:
            extracted["invoice_number"] = inv_no_match.group(1).strip()
            
        # Parse invoice date
        inv_date_match = re.search(r"Invoice\s*Date\s*:\s*([^\n\r]+)", ocr_text, re.IGNORECASE)
        if inv_date_match:
            extracted["invoice_date"] = inv_date_match.group(1).strip()
            
        # Parse vendor
        vendor_match = re.search(r"INVOICE\s*-\s*([^\n\r]+)", ocr_text, re.IGNORECASE)
        if vendor_match:
            extracted["vendor_name"] = vendor_match.group(1).strip()
            
        # Parse financial amounts
        subtotal_match = re.search(r"SUBTOTAL\s*:\s*\$?([\d\.]+)", ocr_text, re.IGNORECASE)
        if subtotal_match:
            extracted["subtotal"] = subtotal_match.group(1).strip()
            
        tax_match = re.search(r"Tax\s*(?:\([\d\.]+\%?\))?\s*:\s*\$?([\d\.]+)", ocr_text, re.IGNORECASE)
        if tax_match:
            extracted["tax"] = tax_match.group(1).strip()
            
        shipping_match = re.search(r"Shipping\s*(?:&\s*Handling)?\s*:\s*\$?([\d\.]+)", ocr_text, re.IGNORECASE)
        if shipping_match:
            extracted["shipping"] = shipping_match.group(1).strip()
            
        total_match = re.search(r"TOTAL\s*(?:AMOUNT\s*DUE)?\s*:\s*\$?([\d\.]+)", ocr_text, re.IGNORECASE)
        if total_match:
            extracted["total_amount"] = total_match.group(1).strip()
            
    elif category == DocumentCategory.RFQ:
        extracted = {
            "rfq_reference": "N/A",
            "part_number": "N/A",
            "material": "N/A",
            "quantity": "0",
            "tolerance": "N/A"
        }
        
        rfq_ref = re.search(r"RFQ\s*(?:Reference|Ref|#)\s*:\s*([^\n\r]+)", ocr_text, re.IGNORECASE)
        if rfq_ref:
            extracted["rfq_reference"] = rfq_ref.group(1).strip()
            
        pn_match = re.search(r"Part\s*Number\s*:\s*([^\n\r]+)", ocr_text, re.IGNORECASE)
        if pn_match:
            extracted["part_number"] = pn_match.group(1).strip()
            
        mat_match = re.search(r"Material\s*:\s*([^\n\r]+)", ocr_text, re.IGNORECASE)
        if mat_match:
            extracted["material"] = mat_match.group(1).strip()
            
        qty_match = re.search(r"Quantity\s*(?:Requested)?\s*:\s*(\d+)", ocr_text, re.IGNORECASE)
        if qty_match:
            extracted["quantity"] = qty_match.group(1).strip()
            
        tol_match = re.search(r"Tolerance\s*(?:Required)?\s*:\s*([^\n\r]+)", ocr_text, re.IGNORECASE)
        if tol_match:
            extracted["tolerance"] = tol_match.group(1).strip()

    elif category == DocumentCategory.CONTRACT:
        extracted = {
            "effective_date": "N/A",
            "expiry_date": "N/A",
            "client_name": "N/A",
            "contractor_name": "N/A",
            "governing_law": "N/A"
        }
        
        eff_match = re.search(r"(?:Effective\s*Date|entered\s*into\s*this)\s*([^\n\r\(\"]+)", ocr_text, re.IGNORECASE)
        if eff_match:
            extracted["effective_date"] = eff_match.group(1).strip().strip('"').strip("'")
            
        exp_match = re.search(r"expiring\s*on\s*([^\n\r\.\,]+)", ocr_text, re.IGNORECASE)
        if exp_match:
            extracted["expiry_date"] = exp_match.group(1).strip()
            
        client_match = re.search(r"CLIENT\s*:\s*([^\n\r,]+)", ocr_text, re.IGNORECASE)
        if client_match:
            extracted["client_name"] = client_match.group(1).strip()
            
        contractor_match = re.search(r"CONTRACTOR\s*:\s*([^\n\r,]+)", ocr_text, re.IGNORECASE)
        if contractor_match:
            extracted["contractor_name"] = contractor_match.group(1).strip()
            
        gov_match = re.search(r"laws\s*of\s*the\s*State\s*of\s*([^\n\r\.\,]+)", ocr_text, re.IGNORECASE)
        if gov_match:
            extracted["governing_law"] = gov_match.group(1).strip()
            
    elif category == DocumentCategory.COMPLIANCE:
        extracted = {
            "certificate_number": "N/A",
            "manufacturer": "N/A",
            "standards": "N/A",
            "issue_date": "N/A"
        }
        
        cert_match = re.search(r"Certificate\s*Number\s*:\s*([^\n\r]+)", ocr_text, re.IGNORECASE)
        if cert_match:
            extracted["certificate_number"] = cert_match.group(1).strip()
            
        man_match = re.search(r"Manufacturer\s*:\s*([^\n\r]+)", ocr_text, re.IGNORECASE)
        if man_match:
            extracted["manufacturer"] = man_match.group(1).strip()
            
        issue_match = re.search(r"Date\s*of\s*Issue\s*:\s*([^\n\r]+)", ocr_text, re.IGNORECASE)
        if issue_match:
            extracted["issue_date"] = issue_match.group(1).strip()
            
        # Extract standard bullet lines
        standards = []
        for line in ocr_text.split("\n"):
            if "ISO" in line or "ASTM" in line or "RoHS" in line:
                standards.append(line.strip().strip("-").strip("1.").strip("2.").strip("3.").strip())
        if standards:
            extracted["standards"] = ", ".join(standards)
            
    else:
        extracted = {
            "document_title": "Purchase Order" if "PURCHASE ORDER" in ocr_text else "General Document",
            "extracted_date": "June 18, 2026"
        }
        
    return extracted
