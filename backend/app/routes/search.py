from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from uuid import UUID
from pydantic import BaseModel

from app.database import get_db
from app.models.auth import User, UserRole
from app.models.document import Document, DocumentCategory, DocumentStatus
from app.routes.auth import get_current_user, RoleChecker
from app.services.vector_store import search_vector_store, query_rag_knowledge
from app.schemas.document import DocumentSimpleResponse

router = APIRouter(prefix="/api/search", tags=["search"])

# Permissions
any_user = RoleChecker([UserRole.ADMIN, UserRole.OPERATOR, UserRole.REVIEWER, UserRole.VIEWER])

# Request schemas
class SemanticSearchRequest(BaseModel):
    query: str
    category: Optional[DocumentCategory] = None
    n_results: Optional[int] = 5

class RagRequest(BaseModel):
    document_ids: List[UUID]
    question: str

# Structured metadata SQL search
@router.get("", response_model=List[DocumentSimpleResponse])
def search_documents_metadata(
    query: Optional[str] = None,
    category: Optional[DocumentCategory] = None,
    status: Optional[DocumentStatus] = None,
    min_score: Optional[float] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(any_user)
):
    sql_query = db.query(Document)
    
    if query:
        sql_query = sql_query.filter(Document.filename.ilike(f"%{query}%"))
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
            "id": doc.id,
            "filename": doc.filename,
            "file_type": doc.file_type,
            "category": doc.category,
            "status": doc.status,
            "consensus_score": doc.consensus_score,
            "created_at": doc.created_at,
            "uploader_name": uploader_name
        })
    return results

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
