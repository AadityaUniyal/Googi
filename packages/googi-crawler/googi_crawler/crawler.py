import logging
import urllib.robotparser
import hashlib
import time
from dataclasses import dataclass, field
from urllib.parse import parse_qsl, urlencode, urljoin, urlparse, urlunparse
import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger("googi_crawler")

@dataclass
class CrawledPageData:
    url: str
    title: str
    text: str
    links: list[str] = field(default_factory=list)
    content_hash: str = ""
    status_code: int = 200


class GoogiCrawler:
    """
    An ethical web crawler supporting robots.txt compliance,
    canonical URL normalization, BFS depth-limiting, and domain restriction.
    """

    def __init__(
        self,
        user_agent: str = "GoogiBot/1.0",
        timeout: float = 5.0,
        request_delay: float = 0.5,
        stay_on_domain: bool = True,
    ):
        self.user_agent = user_agent
        self.timeout = timeout
        self.request_delay = request_delay
        self.stay_on_domain = stay_on_domain
        self._robots_cache: dict[str, urllib.robotparser.RobotFileParser] = {}

    def normalize_url(self, url: str) -> str:
        """
        Normalizes a URL to a canonical format.
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

            return urlunparse((scheme, netloc, path, "", query_str, ""))
        except Exception as e:
            logger.warning(f"Error normalizing URL {url}: {e}")
            return ""

    def is_allowed_by_robots(self, url: str) -> bool:
        """
        Checks if a URL is allowed to be crawled according to robots.txt rules.
        """
        parsed = urlparse(url)
        if not parsed.netloc:
            return False

        netloc = parsed.netloc.lower()
        scheme = parsed.scheme.lower()

        if netloc not in self._robots_cache:
            robots_url = f"{scheme}://{netloc}/robots.txt"
            parser = urllib.robotparser.RobotFileParser()
            try:
                resp = httpx.get(
                    robots_url,
                    timeout=3.0,
                    headers={"User-Agent": self.user_agent}
                )
                if resp.status_code == 200:
                    parser.parse(resp.text.splitlines())
                else:
                    parser.allow_all = True
            except Exception as e:
                logger.debug(f"Failed to fetch robots.txt for {netloc}: {e}. Allowing crawl.")
                parser.allow_all = True
            self._robots_cache[netloc] = parser

        return self._robots_cache[netloc].can_fetch(self.user_agent, url)

    def crawl(self, seed_url: str, max_depth: int = 2) -> dict[str, CrawledPageData]:
        """
        Performs a web crawl starting at seed_url using a queue-based BFS traversal up to max_depth.
        Returns a dictionary mapping page URLs to CrawledPageData.
        """
        canonical_seed = self.normalize_url(seed_url)
        if not canonical_seed:
            logger.error(f"Invalid seed URL: {seed_url}")
            return {}

        seed_parsed = urlparse(canonical_seed)
        seed_domain = seed_parsed.netloc.lower()

        queue = [(canonical_seed, 0)]  # (url, current_depth)
        crawled_graph: dict[str, CrawledPageData] = {}
        visited: set[str] = set()

        logger.info(f"Starting crawl for seed {canonical_seed} up to depth {max_depth}")

        while queue:
            current_url, depth = queue.pop(0)

            if current_url in visited:
                continue

            visited.add(current_url)

            if depth > max_depth:
                continue

            if not self.is_allowed_by_robots(current_url):
                logger.info(f"Crawl disallowed by robots.txt: {current_url}")
                continue

            # Polite request rate limiting delay
            if crawled_graph and self.request_delay > 0:
                time.sleep(self.request_delay)

            logger.info(f"Crawling: {current_url} (depth={depth}/{max_depth})")

            try:
                resp = httpx.get(
                    current_url,
                    timeout=self.timeout,
                    headers={"User-Agent": self.user_agent},
                    follow_redirects=True
                )
                if resp.status_code != 200:
                    logger.warning(f"Failed to fetch {current_url}: status {resp.status_code}")
                    continue

                content_type = resp.headers.get("content-type", "").lower()
                if "html" not in content_type:
                    logger.info(f"Skipping non-HTML page {current_url} (type: {content_type})")
                    continue

                html_content = resp.text
                content_hash = hashlib.sha256(html_content.encode("utf-8")).hexdigest()

                soup = BeautifulSoup(html_content, "html.parser")
                title = soup.title.string.strip() if soup.title and soup.title.string else current_url

                # Extract plain text content
                for script in soup(["script", "style"]):
                    script.decompose()
                plain_text = soup.get_text(separator=" ")
                clean_text = " ".join(plain_text.split())

                # Find out-links
                links = []
                for a in soup.find_all("a", href=True):
                    raw_href = a["href"]
                    full_url = urljoin(current_url, raw_href)
                    normalized = self.normalize_url(full_url)
                    if not normalized:
                        continue

                    # Check domain restriction
                    if self.stay_on_domain:
                        target_domain = urlparse(normalized).netloc.lower()
                        if target_domain != seed_domain:
                            continue

                    links.append(normalized)

                    # Add to traversal queue if we haven't visited it yet
                    if normalized not in visited and (normalized, depth + 1) not in queue:
                        queue.append((normalized, depth + 1))

                # Save crawled data
                crawled_graph[current_url] = CrawledPageData(
                    url=current_url,
                    title=title,
                    text=clean_text,
                    links=list(set(links)),
                    content_hash=content_hash,
                    status_code=resp.status_code
                )

            except Exception as e:
                logger.error(f"Error crawling URL {current_url}: {e}")

        return crawled_graph
