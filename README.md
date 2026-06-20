# Distributed AI Document Intelligence Platform (DocIntel AI)

A production-grade, event-driven Distributed AI Document Intelligence Platform that automates document ingestion, structural OCR extraction, classification, validation, human review, and semantic search. Designed with Google Cloud Platform architectures and software engineering best practices in mind, this platform serves as an enterprise-ready showcase for distributed systems and AI engineering.

---

## 1. The Core Problem & Our Solution

In modern enterprise operations, companies receive thousands of unstructured business documents every day, including:
* **Manufacturing/Logistics**: RFQs (Request for Quotations), Bills of Materials (BOMs), Purchase Orders, Bills of Lading, Delivery Notes.
* **Finance**: Invoices, Credit Notes, Loan Applications, KYC Identity Cards.
* **Legal/Compliance**: MSA/NDAs, Risk Clauses, Conformity Certificates (e.g., ISO, ASTM, RoHS).

Reviewing these documents manually results in human error, delayed decisions, compliance issues, and high labor costs. 

**DocIntel AI** automates this lifecycle entirely:
1. **Ingestion**: Uploads and validates files securely.
2. **OCR**: Converts images/scanned PDFs into layout-aware raw text blocks.
3. **Classification**: Automatically identifies the document type (e.g., Invoice, RFQ, Contract, Compliance).
4. **Agentic Validation**: Validates data accuracy via a multi-agent consensus system.
5. **Human-in-the-Loop (HITL)**: Flags low-confidence extractions or mathematical discrepancies for human verification.
6. **Search & RAG**: Stores document content semantically to enable context-based question answering.

---

## 2. High-Level Pipeline Workflow

The platform operates on an asynchronous event-driven model:

```
[Document Upload] 
       │ (Status: INGESTED)
       ▼
[Publish Event: document.uploaded] ──► [RabbitMQ Broker]
                                              │
                                              ▼
[Background Worker Consumer] ◄────────────────┘
       │ (Status: PROCESSING)
       ├─► [OCR Engine] ──► Extracted Layout Text
       ├─► [Gemini Classifier] ──► Category (e.g., INVOICE)
       │
       ├─► [Multi-Agent Consensus Engine]
       │     ├─ Extractor Agent (Structured JSON)
       │     ├─ Critic Agent (OCR Context Verification)
       │     ├─ Auditor Agent (Deterministic Math Balance)
       │     └─ Compliance Agent (Regulatory Policy Checks)
       │
       ├─► [Consensus Score Calculator]
       │     ├─ If Score >= 85%: Approve (Status: PROCESSED)
       │     └─ If Score < 85% or Flagged: (Status: AWAITING_REVIEW)
       │
       ├─► [ChromaDB Indexing] ──► Text Chunks & Vector Embeddings
       ▼
[Audit Trails Ledger] ──► Immutably Logs Event Contexts
```

---

## 3. Flagship Features

### 🤖 Multi-Agent Consensus System
Traditional extraction systems trust a single AI model's output, leading to hallucinated numbers or format omissions. DocIntel AI solves this by introducing a **4-Agent Verification Circle**:
1. **Extractor Agent**: Extracts structured key-value pairs depending on the document type (e.g., Vendor Name, Subtotal, Part Numbers, Quantity).
2. **Critic Agent**: Audits the extraction. It cross-compares the structured JSON back to the raw OCR text, flagging missing data or digit transpositions.
3. **Auditor Agent**: Runs deterministic mathematical audits. For Invoices, it validates if `Subtotal + Tax + Shipping == Total`. For RFQs, it ensures values are positive. If the math fails, it overrides the score to `0.0`.
4. **Compliance Agent**: Scrapes the document for regulatory checklist items (e.g., Delaware governing law in contracts, RoHS declarations in conformance certificates).
* **Consensus Engine**: Combines the weights ($\text{Critic}=50\%, \text{Auditor}=30\%, \text{Compliance}=20\%$) to assign a field-level confidence score.

### ✍️ Human-in-the-Loop Review Portal
When the Consensus Engine flags a document (overall confidence < 85% or key arithmetic discrepancy), it routes it to the **Review Queue**. Reviewers interact with a split-screen layout:
* **Left Panel**: Raw extracted OCR text layout.
* **Right Panel**: Editable field form. Input fields are color-coded in real-time (Red = defect, Yellow = warning, Green = passed).
* **Concurrency Locking**: Utilizes a Redis-backed session locker (with in-memory dict fallbacks) to prevent multiple reviews on the same document.

### 🔍 Cognitive Vector Search & RAG Chatbot
DocIntel AI supports two modes of search:
1. **Structured SQL Metadata Filters**: Filter by document category, processing status, and confidence scores.
2. **Semantic Vector Search**: Connects to `ChromaDB` to fetch documents matching natural language queries (e.g., "Find stainless steel components").
* **RAG Q&A Sidebar**: Constrain chatbot queries to specific documents. Ask questions like: *"What contracts expire next month?"* or *"Who signed the MSA?"*, and Gemini (or our local TF-IDF answer extraction fallback) returns precise, contextual summaries.

### 📊 KPI Analytics Control Center
A control dashboard displaying platform health:
* Overall processed volume, processing speeds, and human intervention rates.
* Recharts Area graphs showing weekly ingestion trends.
* Recharts Pie graphs showing category distribution.
* **System Node Monitor**: Live ping metrics for Neon Database, RabbitMQ, and ChromaDB.

---

## 4. Technical Architecture Stack

* **Frontend**: Next.js (App Router), TypeScript, Tailwind CSS, Lucide React (Icons), Recharts (Graphs).
* **Backend**: FastAPI, SQLAlchemy (PostgreSQL ORM), PyJWT (Authentication), `pika` (RabbitMQ publisher).
* **Database**: Remote Neon PostgreSQL database (with connection pooling).
* **Cache & Locks**: Redis (storing task locking states).
* **Message Queue**: RabbitMQ (event-driven messaging).
* **Vector DB**: ChromaDB (embedding generation and semantic text searches).
* **AI Models**: Gemini (API integrations) + Heuristic Fallback Engine (runs local regex and TF-IDF extraction if the Gemini API key is not supplied).
* **OCR**: Tesseract OCR (via `pytesseract`) + Mock layout generators.

---

## 5. Directory Layout

```
document-intelligence-platform/
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI Web Server entrypoint
│   │   ├── config.py               # Settings (Neon URL, JWT keys, directories)
│   │   ├── database.py             # SQLAlchemy session creator
│   │   ├── models/                 # SQLAlchemy schemas (auth, documents, audit_logs)
│   │   ├── schemas/                # Pydantic validation schemas
│   │   ├── routes/                 # Endpoint logic (auth, docs, review, search, analytics)
│   │   ├── services/               # System wrappers (ocr, storage, queue, vector_store)
│   │   ├── agents/                 # Multi-Agent Consensus System (critic, auditor, compliance)
│   │   └── worker.py               # RabbitMQ consumer background worker
│   ├── tests/                      # Automated test scripts (pytest)
│   └── requirements.txt            # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── app/                    # Next.js workspace layouts & pages
│   │   ├── lib/                    # API wrappers
│   │   └── components/
│   └── package.json                # Frontend packages (Recharts, Lucide)
├── docker-compose.yml              # Local infrastructure composer (Redis, RabbitMQ)
└── start_platform.ps1              # Multi-process launch script for Windows
```

---

## 6. Installation & Launch Guide

### Prerequisites
1. **Docker Desktop** (for Redis & RabbitMQ).
2. **Node.js** (v18+ recommended).
3. **Python 3.10+**.

### Quick Start (Windows)
We have bundled a PowerShell startup script. Simply execute:
```powershell
./start_platform.ps1
```

### Manual Setup

#### Step 1: Clone and Start Containers
```bash
docker-compose up -d
```

#### Step 2: Set up Backend Environment
```bash
cd backend
python -m pip install -r requirements.txt
```
*(Optional)* Add a `.env` file inside the `backend/` directory:
```env
GEMINI_API_KEY=your_gemini_api_key_here
```
If no key is provided, the platform automatically switches to a high-fidelity mock heuristic engine so everything runs instantly out of the box!

#### Step 3: Run FastAPI Server
```bash
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

#### Step 4: Run Task Worker Daemon
In a new terminal window:
```bash
cd backend
python -m app.worker
```

#### Step 5: Start Next.js Frontend
In a third terminal window:
```bash
cd frontend
npm install
npm run dev
```

Visit:
* **Web Portal UI**: [http://localhost:3000](http://localhost:3000)
* **Backend Swagger API**: [http://localhost:8000/docs](http://localhost:8000/docs)
