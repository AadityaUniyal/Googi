import logging
from typing import Dict, Any
from app.models.document import DocumentCategory

logger = logging.getLogger(__name__)

def run_auditor_agent(category: DocumentCategory, extracted_fields: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    """
    Auditor Agent: Performs deterministic mathematical auditing and logical checks.
    Returns: { field_key: { "score": float, "notes": str } }
    """
    audits = {}
    
    # Pre-populate all fields with 1.0 (Passed audit)
    for key in extracted_fields.keys():
        audits[key] = {
            "score": 1.0,
            "notes": "Passed general logical audit."
        }

    # Perform category-specific mathematical audits
    if category == DocumentCategory.INVOICE:
        try:
            subtotal = float(str(extracted_fields.get("subtotal", 0)).replace("$", "").replace(",", ""))
            tax = float(str(extracted_fields.get("tax", 0)).replace("$", "").replace(",", ""))
            shipping = float(str(extracted_fields.get("shipping", 0)).replace("$", "").replace(",", ""))
            total = float(str(extracted_fields.get("total_amount", 0)).replace("$", "").replace(",", ""))
            
            calculated_total = subtotal + tax + shipping
            difference = abs(calculated_total - total)
            
            if difference > 0.05:  # Tolerance threshold for rounding
                error_msg = f"Arithmetic Mismatch: subtotal ({subtotal}) + tax ({tax}) + shipping ({shipping}) = {calculated_total:.2f}, but invoice total lists {total}"
                logger.warning(error_msg)
                
                # Flag the related fields in the audit
                math_fields = ["subtotal", "tax", "shipping", "total_amount"]
                for f in math_fields:
                    if f in audits:
                        audits[f] = {
                            "score": 0.0,
                            "notes": error_msg
                        }
            else:
                success_msg = f"Audit Verified: {subtotal} + {tax} + {shipping} matches total of {total}"
                for f in ["subtotal", "tax", "shipping", "total_amount"]:
                    if f in audits:
                        audits[f]["notes"] = success_msg
        except ValueError as e:
            # If any value is not convertible to float, audit fails
            err_msg = f"Invalid numeric format for calculation: {str(e)}"
            for f in ["subtotal", "tax", "shipping", "total_amount"]:
                if f in audits:
                    audits[f] = {
                        "score": 0.0,
                        "notes": err_msg
                    }
                    
    elif category == DocumentCategory.RFQ:
        # Example: Verify quantity is a valid positive integer
        qty_str = str(extracted_fields.get("quantity", "0"))
        try:
            qty = int(qty_str)
            if qty <= 0:
                audits["quantity"] = {
                    "score": 0.0,
                    "notes": f"Quantity must be a positive integer, found: {qty}"
                }
            else:
                audits["quantity"] = {
                    "score": 1.0,
                    "notes": f"Quantity verified as positive integer: {qty}"
                }
        except ValueError:
            audits["quantity"] = {
                "score": 0.0,
                "notes": f"Failed to parse quantity as integer: {qty_str}"
            }
            
    return audits
