import logging
import hashlib
import uuid
import httpx
import urllib.robotparser
from urllib.parse import urlparse, urljoin, urlunparse, parse_qsl, urlencode
from typing import List, Dict, Any, Set
from bs4 import BeautifulSoup
from datetime import datetime
from sqlalchemy.orm import Session

from app.models.search import CrawledPage, PageLink
from app.services.vector_store import add_document_to_vector_store
from app.config import settings

logger = logging.getLogger(__name__)

# Cache for Robots.txt Parsers
_robots_cache: Dict[str, urllib.robotparser.RobotFileParser] = {}

def normalize_url(url: str) -> str:
    """
    Normalizes a URL to a canonical format.
    - Scheme and netloc are lowercased.
    - Removes fragment identifiers (#...).
    - Standardizes paths and removes trailing slashes (except root).
    - Sorts query parameters.
    """
    try:
        parsed = urlparse(url)
        scheme = parsed.scheme.lower()
        if scheme not in ("http", "https"):
            return ""
            
        netloc = parsed.netloc.lower()
        path = parsed.path
        if path == "/":
            path = ""
        elif path.endswith("/") and len(path) > 1:
            path = path[:-1]
            
        # Normalize queries
        queries = parse_qsl(parsed.query)
        queries.sort()
        query_str = urlencode(queries) if queries else ""
        
        # Reconstruct canonical URL
        return urlunparse((scheme, netloc, path, "", query_str, ""))
    except Exception as e:
        logger.warning(f"Error normalizing URL {url}: {e}")
        return ""

def is_allowed_by_robots(url: str) -> bool:
    """
    Checks if a URL is allowed to be crawled according to robots.txt rules.
    """
    parsed = urlparse(url)
    if not parsed.netloc:
        return False
        
    netloc = parsed.netloc.lower()
    scheme = parsed.scheme.lower()
    
    if netloc not in _robots_cache:
        robots_url = f"{scheme}://{netloc}/robots.txt"
        parser = urllib.robotparser.RobotFileParser()
        try:
            # Fetch using httpx with short timeout
            resp = httpx.get(robots_url, timeout=3.0, headers={"User-Agent": "GoogiBot/1.0"})
            if resp.status_code == 200:
                parser.parse(resp.text.splitlines())
            elif resp.status_code == 404:
                parser.allow_all = True
            else:
                parser.allow_all = True
        except Exception as e:
            logger.warning(f"Failed to fetch robots.txt for {netloc}: {e}. Defaulting to ALLOW.")
            parser.allow_all = True
        _robots_cache[netloc] = parser
        
    return _robots_cache[netloc].can_fetch("GoogiBot/1.0", url)

def crawl_url_task(db: Session, seed_url: str, max_depth: int = 2) -> List[str]:
    """
    Performs a web crawl starting at seed_url using a queue-based BFS traversal up to max_depth.
    Politely rate-limited and stays within the seed domain.
    """
    canonical_seed = normalize_url(seed_url)
    if not canonical_seed:
        logger.error(f"Invalid seed URL: {seed_url}")
        return []
        
    seed_parsed = urlparse(canonical_seed)
    seed_domain = seed_parsed.netloc.lower()
    
    queue = [(canonical_seed, 0)]  # (url, current_depth)
    visited: Set[str] = set()
    crawled_urls = []
    
    logger.info(f"Starting crawl for seed {canonical_seed} up to depth {max_depth}")
    
    while queue:
        current_url, depth = queue.pop(0)
        
        if current_url in visited:
            continue
            
        visited.add(current_url)
        
        if depth > max_depth:
            continue
            
        # Politely check robots.txt
        if not is_allowed_by_robots(current_url):
            logger.info(f"Crawl disallowed by robots.txt: {current_url}")
            continue
            
        logger.info(f"Crawling: {current_url} (depth={depth}/{max_depth})")
        
        try:
            resp = httpx.get(
                current_url, 
                timeout=5.0, 
                headers={"User-Agent": "GoogiBot/1.0"},
                follow_redirects=True
            )
            if resp.status_code != 200:
                logger.warning(f"Failed to fetch {current_url}: status {resp.status_code}")
                continue
                
            content_type = resp.headers.get("content-type", "").lower()
            if "html" not in content_type:
                logger.info(f"Skipping non-HTML page {current_url} (type: {content_type})")
                continue
                
            # Compute SHA-256 to check for content duplication
            html_content = resp.text
            content_hash = hashlib.sha256(html_content.encode("utf-8")).hexdigest()
            
            # Parse page details
            soup = BeautifulSoup(html_content, "html.parser")
            title = soup.title.string.strip() if soup.title else current_url
            
            # Extract plain text content
            for script in soup(["script", "style"]):
                script.decompose()
            plain_text = soup.get_text(separator=" ")
            clean_text = " ".join(plain_text.split())
            
            # Save page to Database
            page = db.query(CrawledPage).filter(CrawledPage.url == current_url).first()
            if not page:
                page = CrawledPage(
                    id=uuid.uuid4(),
                    url=current_url,
                    title=title,
                    page_content=clean_text,
                    page_hash=content_hash,
                    pagerank=1.0,
                    last_crawled_at=datetime.utcnow()
                )
                db.add(page)
                db.flush()  # Allocate ID
            else:
                page.title = title
                page.page_content = clean_text
                page.page_hash = content_hash
                page.last_crawled_at = datetime.utcnow()
            
            # Index page into ChromaDB vector store
            metadata = {
                "filename": title,
                "category": "WEB_PAGE",
                "url": current_url
            }
            add_document_to_vector_store(str(page.id), clean_text, metadata)
            
            crawled_urls.append(current_url)
            
            # Extract and filter outgoing links
            out_links = set()
            for a in soup.find_all("a", href=True):
                href = a["href"]
                absolute_url = urljoin(current_url, href)
                normalized = normalize_url(absolute_url)
                
                if normalized:
                    # Politeness restriction: stay within seed domain
                    parsed_link = urlparse(normalized)
                    if parsed_link.netloc.lower() == seed_domain:
                        out_links.add(normalized)
                        
            # Record Links and add to crawl queue
            for target_url in out_links:
                # Save linkage
                link_exists = db.query(PageLink).filter(
                    PageLink.source_url == current_url,
                    PageLink.target_url == target_url
                ).first()
                if not link_exists:
                    db.add(PageLink(source_url=current_url, target_url=target_url))
                
                # Add to queue if not yet visited
                if target_url not in visited and depth + 1 <= max_depth:
                    queue.append((target_url, depth + 1))
                    
            db.commit()
            
        except Exception as e:
            logger.error(f"Error crawling URL {current_url}: {e}")
            db.rollback()
            
    logger.info(f"Crawl finished. Crawled {len(crawled_urls)} pages.")
    
    # Auto-calculate PageRank after successful crawl
    compute_pagerank(db)
    return crawled_urls

def compute_pagerank(db: Session, d: float = 0.85, max_iter: int = 30, tol: float = 1e-6):
    """
    Computes PageRank over the crawled link adjacency graph using power iteration.
    Saves scores back to database.
    """
    logger.info("Computing PageRank scores...")
    pages = db.query(CrawledPage).all()
    if not pages:
        return
        
    n = len(pages)
    page_map = {p.url: p for p in pages}
    pr = {p.url: 1.0 / n for p in pages}
    
    # Fetch links
    links = db.query(PageLink).all()
    out_degree = {p.url: 0 for p in pages}
    in_links = {p.url: [] for p in pages}
    
    for link in links:
        if link.source_url in page_map and link.target_url in page_map:
            out_degree[link.source_url] += 1
            in_links[link.target_url].append(link.source_url)
            
    for iteration in range(max_iter):
        new_pr = {}
        # Calculate dangling node rank contribution
        dangling_sum = sum(pr[url] for url in pr if out_degree[url] == 0)
        
        for url in pr:
            rank_sum = sum(pr[source] / out_degree[source] for source in in_links[url])
            new_pr[url] = (1.0 - d) / n + d * (rank_sum + dangling_sum / n)
            
        # Check convergence
        diff = sum(abs(new_pr[url] - pr[url]) for url in pr)
        pr = new_pr
        
        if diff < tol:
            logger.info(f"PageRank converged at iteration {iteration} (diff={diff:.8f})")
            break
            
    # Save back to DB
    for url, rank in pr.items():
        page_map[url].pagerank = rank
    db.commit()
    logger.info("PageRank scores committed to DB.")
