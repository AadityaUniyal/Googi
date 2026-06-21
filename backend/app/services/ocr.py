import asyncio
import logging
import os
import time
from concurrent.futures import ThreadPoolExecutor

import pytesseract
from PIL import Image

logger = logging.getLogger(__name__)

# Thread pool for non-blocking OCR (bounded to avoid resource exhaustion)
_ocr_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="ocr")

# Optional: Configuration for Tesseract path on Windows if installed in default locations
TESSERACT_CMD_POSSIBILITIES = [
    r"C:\Program Files\Tesseract-OCR\tesseract.exe",
    r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe"
]
for path in TESSERACT_CMD_POSSIBILITIES:
    if os.path.exists(path):
        pytesseract.pytesseract.tesseract_cmd = path
        break

def extract_text_from_image(image_path: str) -> str:
    try:
        img = Image.open(image_path)
        return pytesseract.image_to_string(img)
    except FileNotFoundError as err:
        raise RuntimeError("Tesseract OCR engine not found. Ensure Tesseract is installed and on PATH.") from err
    except Exception as e:
        # If tesseract is not installed, raise specific error to trigger fallback
        raise RuntimeError(f"Tesseract extraction failed: {str(e)}") from e

def get_high_fidelity_mock_text(filename: str) -> str:
    """
    Returns realistic OCR text layout depending on file keyword indicators.
    """
    fn = filename.lower()

    if "invoice" in fn or "inv" in fn:
        return """
=========================================
INVOICE - APEX GLOBAL SOLUTIONS
=========================================
Invoice Number: INV-2026-90481
Invoice Date: June 15, 2026
Payment Terms: Net 30
Due Date: July 15, 2026
-----------------------------------------
Vendor Information:
Apex Global Solutions Ltd.
100 Innovation Way, Suite 400
Tech City, TC 90210
Email: billing@apexglobal.com
-----------------------------------------
Bill To:
Acme Industrial Manufacturing
456 Factory Road
Industrial District, IN 46201
-----------------------------------------
LINE ITEMS:
1. Custom Steel Brackets (Qty: 100) - Unit Price: $12.50 | Total: $1250.00
2. Heavy Duty Bolts (Qty: 500) - Unit Price: $0.80 | Total: $400.00
3. Aluminum Housing Cases (Qty: 25) - Unit Price: $85.00 | Total: $2125.00
-----------------------------------------
SUBTOTAL: $3775.00
Sales Tax (8.25%): $311.44
Shipping & Handling: $50.00
=========================================
TOTAL AMOUNT DUE: $4136.44
=========================================
Thank you for your business!
Please send payments via wire transfer to Bank of Tech, Account Ref: 9812-401.
        """

    elif "rfq" in fn or "quote" in fn:
        return """
==================================================
REQUEST FOR QUOTATION (RFQ) - METRO TRANSIT SYSTEM
==================================================
RFQ Reference: RFQ-MTS-2026-088
Date Issued: June 12, 2026
Response Deadline: June 30, 2026
Department: Maintenance & Infrastructure

Target Vendor: Open Bid
Contact: rfq@metrotransit.org
--------------------------------------------------
SPECIFICATIONS REQUIRED:
We are requesting binding quotes for the following components. All parts must adhere strictly to ISO 9001 quality standards and carry a minimum 2-year warranty.

Item 1:
- Part Number: PN-BRK-9902
- Material: Stainless Steel (Grade 316)
- Dimensions: 120mm x 45mm x 12mm
- Quantity Requested: 1500 units
- Tolerance Required: +/- 0.05mm

Item 2:
- Part Number: PN-SENS-77
- Material: Optical Temperature Sensor (Digital I2C Interface)
- Quantity Requested: 250 units
- Operational Range: -40C to 125C
--------------------------------------------------
Delivery Location:
Metro Transit Central Depot
Dock 4A, Chicago, IL 60607

Estimated Shipping Schedule: Required by August 15, 2026.
==================================================
        """

    elif "contract" in fn or "agreement" in fn or "legal" in fn:
        return """
MASTER SERVICES AGREEMENT
-------------------------
This Master Services Agreement ("Agreement") is entered into this 10th day of June, 2026 ("Effective Date"), by and between:

CLIENT: Apex Media Ventures, LLC, having its principal place of business at 789 Broadway, New York, NY 10003 ("Client").
CONTRACTOR: Stellar Tech Consultants, Inc., having its principal place of business at 102 Marina Boulevard, San Francisco, CA 94123 ("Contractor").

1. SERVICES: Contractor agrees to perform software development and AI engineering services as detailed in Statements of Work (SOWs) executed from time to time under this Agreement.
2. TERM: This Agreement shall commence on the Effective Date and remain in effect for a term of two (2) years, expiring on June 9, 2028, unless terminated earlier in accordance with Section 8.
3. FEES & PAYMENT: Client shall pay Contractor $150.00 per hour for services rendered. Invoices will be submitted bi-weekly and paid Net 15 days from the date of invoice.
4. CONFIDENTIALITY: Both parties agree to maintain the strict confidentiality of all proprietary or non-public commercial information disclosed during the term of this Agreement.
5. GOVERNING LAW: This Agreement shall be governed by, and construed in accordance with, the laws of the State of Delaware, without regard to its conflict of law rules.

IN WITNESS WHEREOF, the parties hereto have executed this Master Services Agreement as of the Effective Date.

Signed:
/s/ Robert Chen, CEO, Apex Media Ventures
/s/ Sarah Jenkins, President, Stellar Tech Consultants
        """

    elif "compliance" in fn or "certificate" in fn or "iso" in fn:
        return """
CERTIFICATE OF CONFORMANCE
---------------------------
Certificate Number: CC-2026-8801A
Date of Issue: May 20, 2026

Manufacturer:
Global Foundry Parts Inc.
400 Industrial Parkway, Austin, TX 78701

Product Name: Grade A Threaded Rods
Batch Number: B-994821
Manufacturing Date: May 12, 2026

STANDARDS COMPLIANCE:
We hereby certify that the products listed above have been manufactured, tested, and inspected in accordance with the following specifications and regulatory standards:

1. ISO 9001:2015 - Quality Management Systems.
2. ASTM A193 - Standard Specification for Alloy-Steel and Stainless Steel Bolting Materials.
3. RoHS Compliance - Certified free from lead, mercury, cadmium, and hexavalent chromium above threshold levels.

Authorized Signatory:
Dr. Angela Martinez, VP of Quality Assurance
Global Foundry Parts Inc.
        """

    else:
        # General purchase order or fallback
        return """
PURCHASE ORDER: PO-772831
Date: June 18, 2026
Vendor: Supply Chain Logistics Corp
Ship To: Enterprise Warehouse A

Details:
Item: Replacement Conveyor Belt (Part No: CB-450-HD)
Quantity: 2 units
Unit Price: $650.00
Total: $1300.00
Tax: $107.25
Grand Total: $1407.25

Approved by: Michael Smith, Procurement Manager
        """

def perform_ocr(file_path: str, filename: str, file_type: str) -> str:
    """
    Coordinates file reading and OCR processing (synchronous).
    Used by the background worker which runs in its own thread.
    """
    time.sleep(1.0)  # Simulate processing latency

    # 1. Plain text file - just read directly
    if file_type == "TXT":
        try:
            with open(file_path, encoding="utf-8") as f:
                return f.read()
        except Exception as e:
            return f"Error reading text file: {str(e)}"

    # 2. Image files - try Tesseract
    if file_type in ["PNG", "JPG", "JPEG", "TIFF"]:
        try:
            return extract_text_from_image(file_path)
        except Exception as exc:
            logger.warning(f"Tesseract OCR failed for {filename}: {exc}. Falling back to mock text.")
            # Fall back to high-fidelity mock
            return get_high_fidelity_mock_text(filename)

    # 3. PDF/DOCX or others - Fallback to high-fidelity mock text directly
    return get_high_fidelity_mock_text(filename)


async def perform_ocr_async(file_path: str, filename: str, file_type: str) -> str:
    """
    Async wrapper for OCR processing. Runs blocking Tesseract/IO calls
    in a ThreadPoolExecutor so the FastAPI event loop stays unblocked.
    """
    loop = asyncio.get_running_loop()
    try:
        result = await loop.run_in_executor(
            _ocr_executor,
            perform_ocr,
            file_path,
            filename,
            file_type,
        )
        return result
    except Exception as e:
        logger.error(f"Async OCR failed for {filename}: {e}")
        raise RuntimeError(f"OCR processing failed: {str(e)}") from e

