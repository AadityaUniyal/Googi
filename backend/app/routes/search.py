import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.auth import User, UserRole
from app.models.document import Document, DocumentCategory, DocumentStatus
from app.routes.auth import RoleChecker
from app.services.vector_store import query_rag_knowledge, search_vector_store

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/search", tags=["search"])

# Permissions
any_user = RoleChecker([UserRole.ADMIN, UserRole.OPERATOR, UserRole.REVIEWER, UserRole.VIEWER])

@router.get("/suggest")
def get_autocomplete_suggestions(
    q: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(any_user)
):
    """
    Returns query auto-suggestions based on historical SearchLogs with filename fallback.
    """
    if not q or len(q.strip()) == 0:
        return []

    prefix = q.strip().lower()

    from sqlalchemy import func

    from app.models.search import SearchLog

    # Query popular queries matching the prefix
    suggestions = db.query(
        SearchLog.query_text,
        func.count(SearchLog.id).label("count")
    ).filter(
        SearchLog.query_text.ilike(f"{prefix}%")
    ).group_by(
        SearchLog.query_text
    ).order_by(
        func.count(SearchLog.id).desc()
    ).limit(5).all()

    results = [s.query_text for s in suggestions]

    if not results:
        # Fall back to distinct categories or matching filenames
        from app.models.document import Document
        filenames = db.query(Document.filename).filter(
            Document.filename.ilike(f"%{prefix}%")
        ).limit(5).all()
        results = list(set([f.filename for f in filenames]))

    return results

# Permissions
any_user = RoleChecker([UserRole.ADMIN, UserRole.OPERATOR, UserRole.REVIEWER, UserRole.VIEWER])

# Request schemas
class SemanticSearchRequest(BaseModel):
    query: str
    category: DocumentCategory | None = None
    n_results: int | None = 5

class RagRequest(BaseModel):
    document_ids: list[UUID]
    question: str

def parse_facets(query: str) -> tuple[str, dict]:
    """
    Parses search operators out of the query.
    Example: "ACME type:invoice confidence:>0.9" -> ("ACME", {"type": "invoice", "confidence": 0.9})
    """
    import re
    facets = {}
    clean_query = query

    # Match type:X
    type_match = re.search(r'\btype:(\w+)\b', clean_query)
    if type_match:
        facets["type"] = type_match.group(1).upper()
        clean_query = re.sub(r'\btype:\w+\b', '', clean_query)

    # Match confidence:>X or confidence:X
    conf_match = re.search(r'\bconfidence:([<>]=?)?([0-9.]+)\b', clean_query)
    if conf_match:
        operator = conf_match.group(1) or "="
        value = float(conf_match.group(2))
        facets["confidence"] = (operator, value)
        clean_query = re.sub(r'\bconfidence:[<>]=?[0-9.]+\b', '', clean_query)

    # Match vendor:X
    vendor_match = re.search(r'\bvendor:(\w+)\b', clean_query)
    if vendor_match:
        facets["vendor"] = vendor_match.group(1).lower()
        clean_query = re.sub(r'\bvendor:\w+\b', '', clean_query)

    return clean_query.strip(), facets

def generate_snippet(text: str, query: str) -> str:
    """
    Finds up to 2 sentences in text containing the query terms,
    scores them by keyword density, and bolds matches with <mark> tags.
    """
    if not text or not query:
        return ""

    import re
    # Clean query terms
    terms = [re.escape(t.strip().lower()) for t in query.split() if len(t.strip()) > 1]
    if not terms:
        return text[:150] + "..." if len(text) > 150 else text

    # Split text into sentences
    sentences = re.split(r'(?<=[.!?])\s+', text)
    scored_sentences = []

    for sent in sentences:
        sent_lower = sent.lower()
        score = 0
        matched_terms = []
        for term in terms:
            matches = len(re.findall(term, sent_lower))
            if matches > 0:
                score += matches * 10
                score += 5
                matched_terms.append(term)
        if score > 0:
            score = score / (1 + 0.01 * len(sent.split()))
            scored_sentences.append((score, sent, matched_terms))

    if not scored_sentences:
        return text[:150] + "..." if len(text) > 150 else text

    scored_sentences.sort(key=lambda x: x[0], reverse=True)
    top_sents = scored_sentences[:2]
    top_sents.sort(key=lambda x: sentences.index(x[1]))

    final_sentences = []
    for _score, sent, matched in top_sents:
        highlighted = sent
        for term in set(matched):
            highlighted = re.sub(
                f"(?i)({term})",
                r"<mark>\1</mark>",
                highlighted
            )
        final_sentences.append(highlighted)

    snippet = " ... ".join(final_sentences)
    if len(snippet) > 250:
        snippet = snippet[:250] + "..."
    return snippet

# Structured metadata SQL search & Hybrid search
@router.get("")
def search_documents_metadata(
    query: str | None = None,
    category: DocumentCategory | None = None,
    status: DocumentStatus | None = None,
    min_score: float | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(any_user)
):
    import time

    from sqlalchemy import func, or_

    from app.models.search import CrawledPage, SearchLog

    start_time = time.time()

    # 1. Fallback: Metadata listing when no query parameter is provided
    if not query:
        sql_query = db.query(Document)
        if category:
            sql_query = sql_query.filter(Document.category == category)
        if status:
            sql_query = sql_query.filter(Document.status == status)
        if min_score is not None:
            sql_query = sql_query.filter(Document.consensus_score >= min_score)

        documents = sql_query.order_by(Document.created_at.desc()).all()
        results = []
        for doc in documents:
            uploader_name = doc.uploader.full_name if doc.uploader else "System"
            results.append({
                "id": str(doc.id),
                "filename": doc.filename,
                "type": "file",
                "category": doc.category.value if doc.category else "UNKNOWN",
                "status": doc.status.value if doc.status else "INGESTED",
                "consensus_score": doc.consensus_score,
                "created_at": doc.created_at.isoformat(),
                "uploader_name": uploader_name,
                "snippet": doc.ocr_text[:150] + "..." if doc.ocr_text else "",
                "score": 1.0
            })
        return results

    # 2. Hybrid Search Mode (when query parameter is supplied)
    clean_query, facets = parse_facets(query)
    if not clean_query:
        clean_query = query

    bm25_results = {}
    crawled_results = {}

    is_postgres = db.bind.dialect.name == "postgresql"
    terms = [t.lower() for t in clean_query.split() if len(t) > 1]

    # A. Search Files (Documents)
    if is_postgres:
        tsvector = func.to_tsvector('english', Document.ocr_text)
        tsquery = func.plainto_tsquery('english', clean_query)
        rank = func.ts_rank_cd(tsvector, tsquery)
        doc_matches = db.query(Document, rank).filter(tsvector.op("@@")(tsquery)).all()
        for doc, score in doc_matches:
            bm25_results[str(doc.id)] = {"type": "file", "obj": doc, "score": score}
    else:
        # SQLite Substring matching
        doc_matches = db.query(Document).filter(
            or_(*[Document.ocr_text.ilike(f"%{t}%") for t in terms]) if terms else True
        ).all()
        for doc in doc_matches:
            freq = sum(doc.ocr_text.lower().count(t) for t in terms) if doc.ocr_text else 1
            bm25_results[str(doc.id)] = {"type": "file", "obj": doc, "score": float(freq)}

    # B. Search Crawled Web Pages
    if is_postgres:
        tsvector = func.to_tsvector('english', CrawledPage.page_content)
        tsquery = func.plainto_tsquery('english', clean_query)
        rank = func.ts_rank_cd(tsvector, tsquery)
        page_matches = db.query(CrawledPage, rank).filter(tsvector.op("@@")(tsquery)).all()
        for page, score in page_matches:
            crawled_results[str(page.id)] = {"type": "web", "obj": page, "score": score}
    else:
        page_matches = db.query(CrawledPage).filter(
            or_(*[CrawledPage.page_content.ilike(f"%{t}%") for t in terms]) if terms else True
        ).all()
        for page in page_matches:
            freq = sum(page.page_content.lower().count(t) for t in terms) if page.page_content else 1
            crawled_results[str(page.id)] = {"type": "web", "obj": page, "score": float(freq)}

    # C. Search ChromaDB (Semantic Vector Store)
    vector_scores = {}
    try:
        vector_results = search_vector_store(query_text=clean_query, n_results=10)
        for res in vector_results:
            doc_id = res["document_id"]
            similarity = 1.0 - (res["distance"] / 2.0)
            vector_scores[doc_id] = max(vector_scores.get(doc_id, 0.0), similarity)
    except Exception as e:
        logger.error(f"Semantic search failed during hybrid run: {e}")

    # D. Merge and Score Linear Combinations
    all_keys = set(bm25_results.keys()) | set(crawled_results.keys()) | set(vector_scores.keys())
    combined_results = []

    alpha = 0.5  # Keyword vs Semantic balance

    for key in all_keys:
        kw_data = bm25_results.get(key) or crawled_results.get(key)
        sem_score = vector_scores.get(key, 0.0)
        kw_score = kw_data["score"] if kw_data else 0.0

        # Linear score
        final_score = (alpha * kw_score) + ((1.0 - alpha) * sem_score)

        if kw_data:
            obj_type = kw_data["type"]
            obj = kw_data["obj"]
        else:
            # Vector-only match
            doc_obj = db.query(Document).filter(Document.id == key).first()
            if doc_obj:
                obj_type = "file"
                obj = doc_obj
            else:
                page_obj = db.query(CrawledPage).filter(CrawledPage.id == key).first()
                if page_obj:
                    obj_type = "web"
                    obj = page_obj
                else:
                    continue

        # Apply PageRank multiplier to web pages
        if obj_type == "web":
            final_score = final_score * (1.0 + 0.5 * obj.pagerank)

        # Apply Facets
        # 1. Type Facet
        if facets.get("type"):
            f_type = facets["type"]
            if f_type == "WEB" and obj_type != "web":
                continue
            if f_type != "WEB" and obj_type == "web":
                continue

        # 2. Confidence Facet
        if obj_type == "file" and "confidence" in facets:
            op, val = facets["confidence"]
            score_val = obj.consensus_score or 0.0
            if op == ">" and not (score_val > val):
                continue
            if op == "<" and not (score_val < val):
                continue
            if op == ">=" and not (score_val >= val):
                continue
            if op == "<=" and not (score_val <= val):
                continue
            if op == "=" and not (score_val == val):
                continue

        # Extract snippet with bold markup
        snippet_text = obj.ocr_text if obj_type == "file" else obj.page_content
        snippet = generate_snippet(snippet_text, clean_query)

        if obj_type == "file":
            result_item = {
                "id": str(obj.id),
                "filename": obj.filename,
                "type": "file",
                "category": obj.category.value if obj.category else "UNKNOWN",
                "consensus_score": obj.consensus_score,
                "created_at": obj.created_at.isoformat(),
                "snippet": snippet,
                "score": round(final_score, 4)
            }
        else:
            result_item = {
                "id": str(obj.id),
                "filename": obj.title or obj.url,
                "type": "web",
                "category": "WEB_PAGE",
                "url": obj.url,
                "consensus_score": 1.0,
                "created_at": obj.last_crawled_at.isoformat(),
                "snippet": snippet,
                "score": round(final_score, 4)
            }
        combined_results.append(result_item)

    combined_results.sort(key=lambda x: x["score"], reverse=True)

    # Save search metrics log
    latency_ms = int((time.time() - start_time) * 1000)
    try:
        db.add(SearchLog(query_text=query, results_count=len(combined_results), latency_ms=latency_ms))
        db.commit()
    except Exception as e:
        logger.error(f"Failed to save search log metrics: {e}")
        db.rollback()

    return combined_results

# Vector Semantic Search
@router.post("/semantic")
def search_semantic(
    request: SemanticSearchRequest,
    current_user: User = Depends(any_user)
):
    filter_meta = {}
    if request.category:
        filter_meta["category"] = request.category.value

    results = search_vector_store(
        query_text=request.query,
        filter_metadata=filter_meta if filter_meta else None,
        n_results=request.n_results
    )
    return results

# RAG Q&A Sidebar
@router.post("/rag")
def ask_document_corpus(
    request: RagRequest,
    current_user: User = Depends(any_user)
):
    if not request.document_ids:
        raise HTTPException(
            status_code=400,
            detail="Please specify at least one document ID for context."
        )

    answer = query_rag_knowledge(
        document_ids=[str(doc_id) for doc_id in request.document_ids],
        question=request.question
    )
    return {"answer": answer}
