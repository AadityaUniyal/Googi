import pytest
from sqlalchemy.orm import Session
from app.services.crawler import normalize_url, is_allowed_by_robots, compute_pagerank
from app.models.search import CrawledPage, PageLink

def test_normalize_url():
    # Test normalization cases
    assert normalize_url("https://example.com/") == "https://example.com"
    assert normalize_url("HTTP://EXAMPLE.COM/path/") == "http://example.com/path"
    assert normalize_url("https://example.com/path?b=2&a=1#section") == "https://example.com/path?a=1&b=2"
    assert normalize_url("mailto:info@example.com") == ""
    assert normalize_url("invalid-url") == ""

def test_is_allowed_by_robots():
    # Simple check, should default to True for mock/unknown hosts
    assert is_allowed_by_robots("https://example-test-unknown.com/path") is True

def test_pagerank_calculation(db_session: Session):
    # Setup test nodes (crawled pages)
    page_a = CrawledPage(url="https://site.com/a", title="Page A", pagerank=1.0)
    page_b = CrawledPage(url="https://site.com/b", title="Page B", pagerank=1.0)
    page_c = CrawledPage(url="https://site.com/c", title="Page C", pagerank=1.0)
    db_session.add_all([page_a, page_b, page_c])
    db_session.commit()

    # Setup directed links: A -> B, B -> C, C -> A
    link_ab = PageLink(source_url="https://site.com/a", target_url="https://site.com/b")
    link_bc = PageLink(source_url="https://site.com/b", target_url="https://site.com/c")
    link_ca = PageLink(source_url="https://site.com/c", target_url="https://site.com/a")
    db_session.add_all([link_ab, link_bc, link_ca])
    db_session.commit()

    # Compute PageRank
    compute_pagerank(db_session, d=0.85, max_iter=20, tol=1e-6)

    # Fetch updated ranks
    db_session.expire_all()
    updated_a = db_session.query(CrawledPage).filter(CrawledPage.url == "https://site.com/a").first()
    updated_b = db_session.query(CrawledPage).filter(CrawledPage.url == "https://site.com/b").first()
    updated_c = db_session.query(CrawledPage).filter(CrawledPage.url == "https://site.com/c").first()

    # Ranks should converge to equal values due to symmetric circular topology
    assert abs(updated_a.pagerank - updated_b.pagerank) < 1e-4
    assert abs(updated_b.pagerank - updated_c.pagerank) < 1e-4
    assert updated_a.pagerank > 0.0
