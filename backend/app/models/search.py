import uuid
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Float, Text
from datetime import datetime
from app.database import Base, GUID

class SearchLog(Base):
    __tablename__ = "search_logs"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    query_text = Column(String, nullable=False, index=True)
    results_count = Column(Integer, default=0)
    latency_ms = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

class CrawledPage(Base):
    __tablename__ = "crawled_pages"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    url = Column(String, nullable=False, unique=True, index=True)
    title = Column(String, nullable=True)
    page_content = Column(Text, nullable=True)
    page_hash = Column(String(64), nullable=True)
    pagerank = Column(Float, default=1.0, nullable=False)
    last_crawled_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class PageLink(Base):
    __tablename__ = "page_links"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    source_url = Column(String, nullable=False, index=True)
    target_url = Column(String, nullable=False, index=True)
