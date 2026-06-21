from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel, HttpUrl

from app.database import get_db
from app.models.auth import UserRole
from app.routes.auth import RoleChecker
from app.models.search import CrawledPage
from app.services.crawler import crawl_url_task, compute_pagerank

router = APIRouter(prefix="/api/crawl", tags=["crawl"])

# Permissions (Only Operator/Admin can trigger crawls)
operator_or_admin = RoleChecker([UserRole.ADMIN, UserRole.OPERATOR])
any_user = RoleChecker([UserRole.ADMIN, UserRole.OPERATOR, UserRole.REVIEWER, UserRole.VIEWER])

class CrawlRequest(BaseModel):
    url: str
    max_depth: Optional[int] = 2

class CrawledPageResponse(BaseModel):
    url: str
    title: Optional[str]
    pagerank: float
    last_crawled_at: str

    class Config:
        from_attributes = True

def run_crawl_background(seed_url: str, max_depth: int):
    """Worker background task wrapper for crawling"""
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        crawl_url_task(db, seed_url, max_depth)
    finally:
        db.close()

@router.post("")
def start_crawl(
    request: CrawlRequest,
    background_tasks: BackgroundTasks,
    current_user: str = Depends(operator_or_admin)
):
    """
    Triggers a background task to crawl the website starting from seed url.
    """
    url_str = str(request.url).strip()
    if not url_str.startswith(("http://", "https://")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="URL must start with http:// or https://"
        )
    background_tasks.add_task(run_crawl_background, url_str, request.max_depth)
    return {"message": f"Crawl task registered in background for: {url_str}"}

@router.get("/pages")
def list_crawled_pages(
    db: Session = Depends(get_db),
    current_user: str = Depends(any_user)
):
    """
    Returns list of all crawled pages and their PageRank score.
    """
    pages = db.query(CrawledPage).order_by(CrawledPage.pagerank.desc()).all()
    results = []
    for p in pages:
        results.append({
            "id": p.id,
            "url": p.url,
            "title": p.title,
            "pagerank": round(p.pagerank, 6),
            "last_crawled_at": p.last_crawled_at.isoformat()
        })
    return results

@router.post("/pagerank")
def force_pagerank(
    db: Session = Depends(get_db),
    current_user: str = Depends(operator_or_admin)
):
    """
    Forces recalculation of PageRank scores across all crawled URLs.
    """
    compute_pagerank(db)
    return {"message": "PageRank calculation completed successfully."}
