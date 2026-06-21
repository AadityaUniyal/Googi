import json
import logging
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

def run_critic_agent(ocr_text: str, extracted_fields: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """
    Critic Agent: Checks extracted values against the raw OCR text.
    Returns a dictionary of: { field_key: { "score": float, "notes": str } }
    """
    if settings.GEMINI_API_KEY:
        try:
            return call_gemini_critic(ocr_text, extracted_fields)
        except Exception as e:
            logger.error(f"Gemini Critic Agent failed: {str(e)}. Falling back to local critic.")

    return run_local_critic(ocr_text, extracted_fields)

def call_gemini_critic(ocr_text: str, extracted_fields: dict[str, Any]) -> dict[str, dict[str, Any]]:
    prompt = f"""
    You are a Critic Agent. Your task is to verify if the extracted field values match the original OCR text.
    For each field in the extracted JSON, check if it is correct or contains hallucinations/errors.

    Assign a score between 0.0 (completely wrong/hallucinated) and 1.0 (perfectly accurate).
    Provide brief verification notes.

    Extracted Fields:
    {json.dumps(extracted_fields, indent=2)}

    OCR Text:
    {ocr_text}

    Respond ONLY with a valid JSON block of the format:
    {{
        "field_key": {{
            "score": 0.95,
            "notes": "Matches OCR text exactly"
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

def run_local_critic(ocr_text: str, extracted_fields: dict[str, Any]) -> dict[str, dict[str, Any]]:
    evaluations = {}
    ocr_lower = ocr_text.lower()

    for key, val in extracted_fields.items():
        val_str = str(val).strip()

        if not val_str or val_str == "N/A":
            evaluations[key] = {
                "score": 0.40,
                "notes": "Field value not found in text or is empty."
            }
            continue

        # Clean currency symbols for presence check
        clean_val = val_str.replace("$", "").replace(",", "").strip()

        # Check if the value is contained inside the OCR text
        # If yes, high score. If no, flag it.
        if clean_val.lower() in ocr_lower or val_str.lower() in ocr_lower:
            evaluations[key] = {
                "score": 0.98,
                "notes": f"Verified: '{val_str}' matches text segment."
            }
        else:
            # Let's perform a float/int conversion check
            try:
                # E.g. 1250 instead of 1250.00
                float_val = float(clean_val)
                found = False
                for token in ocr_lower.split():
                    clean_token = token.replace("$", "").replace(",", "").strip(".:;!?")
                    try:
                        if float(clean_token) == float_val:
                            found = True
                            break
                    except ValueError:
                        continue
                if found:
                    evaluations[key] = {
                        "score": 0.95,
                        "notes": f"Value match found via numeric conversion: {val_str}"
                    }
                    continue
            except ValueError:
                pass

            evaluations[key] = {
                "score": 0.50,
                "notes": f"Warning: value '{val_str}' could not be verified in OCR text."
            }

    return evaluations
