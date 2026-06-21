import logging
from typing import Dict, Any, List, Tuple
from app.models.document import DocumentCategory, FieldValidationStatus
from app.agents.extractor import run_extractor_agent
from app.agents.critic import run_critic_agent
from app.agents.auditor import run_auditor_agent
from app.agents.compliance import run_compliance_agent

logger = logging.getLogger(__name__)

# Category-aware agent weight configuration: (critic, auditor, compliance)
WEIGHT_CONFIG: Dict[DocumentCategory, Tuple[float, float, float]] = {
    DocumentCategory.INVOICE:        (0.3, 0.5, 0.2),  # Math matters most
    DocumentCategory.CONTRACT:       (0.3, 0.1, 0.6),  # Compliance matters most
    DocumentCategory.COMPLIANCE:     (0.2, 0.1, 0.7),  # Compliance critical
    DocumentCategory.RFQ:            (0.5, 0.3, 0.2),  # Accuracy matters most
    DocumentCategory.PURCHASE_ORDER: (0.4, 0.4, 0.2),  # Balanced
    DocumentCategory.UNKNOWN:        (0.5, 0.3, 0.2),  # Default
}

def run_agent_consensus(ocr_text: str, category: DocumentCategory) -> Dict[str, Any]:
    """
    Orchestrates the multi-agent consensus system:
    1. Extractor Agent extracts fields.
    2. Critic Agent verifies presence/accuracy.
    3. Auditor Agent checks math logic.
    4. Compliance Agent evaluates regulatory checklist.
    5. Computes a field-level consensus score using category-aware weights.
    """
    logger.info(f"Starting multi-agent consensus validation for category: {category.value}")
    
    # 1. Extractor Agent
    extracted_fields = run_extractor_agent(ocr_text, category)
    logger.info(f"Extractor Agent completed: {list(extracted_fields.keys())}")
    
    # 2. Critic Agent
    critic_results = run_critic_agent(ocr_text, extracted_fields)
    logger.info("Critic Agent validation completed")
    
    # 3. Auditor Agent
    auditor_results = run_auditor_agent(category, extracted_fields)
    logger.info("Auditor Agent verification completed")
    
    # 4. Compliance Agent
    compliance_results = run_compliance_agent(ocr_text, category, extracted_fields)
    logger.info("Compliance Agent verification completed")
    
    # 5. Consensus Calculation with category-aware weights
    w_critic, w_auditor, w_compliance = WEIGHT_CONFIG.get(
        category, WEIGHT_CONFIG[DocumentCategory.UNKNOWN]
    )
    logger.info(f"Using weights — critic: {w_critic}, auditor: {w_auditor}, compliance: {w_compliance}")

    field_reports = []
    total_confidence = 0.0
    
    for key, value in extracted_fields.items():
        critic_eval = critic_results.get(key, {"score": 1.0, "notes": ""})
        auditor_eval = auditor_results.get(key, {"score": 1.0, "notes": ""})
        compliance_eval = compliance_results.get(key, {"score": 1.0, "notes": ""})
        
        critic_score = critic_eval["score"]
        auditor_score = auditor_eval["score"]
        compliance_score = compliance_eval["score"]
        
        # Weighted Confidence Score Calculation (category-aware)
        confidence = (critic_score * w_critic) + (auditor_score * w_auditor) + (compliance_score * w_compliance)
        
        # Determine status and compile notes
        notes_list = []
        if critic_eval["notes"]:
            notes_list.append(f"Critic: {critic_eval['notes']}")
        if auditor_eval["notes"] and auditor_score < 1.0:
            notes_list.append(f"Auditor Warning: {auditor_eval['notes']}")
        if compliance_eval["notes"] and compliance_score < 1.0:
            notes_list.append(f"Compliance Alert: {compliance_eval['notes']}")
            
        validation_notes = " | ".join(notes_list) if notes_list else "All checks verified successfully."
        validation_status = FieldValidationStatus.VALID
        
        # Flag if score is low or if there is an audit/compliance failure
        if confidence < 0.85 or auditor_score == 0.0 or compliance_score == 0.0:
            validation_status = FieldValidationStatus.FLAGGED
            
        field_reports.append({
            "field_key": key,
            "extracted_value": str(value),
            "critic_score": critic_score,
            "auditor_score": auditor_score,
            "consensus_value": str(value),  # Initially matches extracted value
            "confidence_score": round(confidence, 4),
            "is_modified": False,
            "validation_status": validation_status,
            "validation_notes": validation_notes
        })
        
        total_confidence += confidence
        
    overall_score = round(total_confidence / len(field_reports), 4) if field_reports else 1.0
    logger.info(f"Consensus validation completed. Overall Score: {overall_score:.2%}")
    
    return {
        "overall_score": overall_score,
        "fields": field_reports
    }

