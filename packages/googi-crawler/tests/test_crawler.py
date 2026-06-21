import pytest
from googi_crawler import GoogiCrawler, compute_pagerank

def test_url_normalization():
    crawler = GoogiCrawler()
    
    assert crawler.normalize_url("HTTP://EXAMPLE.COM/") == "http://example.com"
    assert crawler.normalize_url("https://example.com/path/?b=2&a=1#fragment") == "https://example.com/path?a=1&b=2"
    assert crawler.normalize_url("invalid-url") == ""


def test_pagerank_simple_graph():
    # Simple two-node loop graph
    # Node A -> Node B
    # Node B -> Node A
    graph = {
        "A": ["B"],
        "B": ["A"]
    }
    
    ranks = compute_pagerank(graph)
    assert len(ranks) == 2
    # Since it's symmetrical, A and B must have equal PageRank summing to 1.0
    assert abs(ranks["A"] - 0.5) < 1e-5
    assert abs(ranks["B"] - 0.5) < 1e-5
    assert abs(sum(ranks.values()) - 1.0) < 1e-5


def test_pagerank_dangling_node():
    # Node A -> Node B (B is dangling, has no out-links)
    graph = {
        "A": ["B"],
        "B": []
    }
    
    ranks = compute_pagerank(graph)
    # Dandling node B redistributes its score back to all pages equally
    assert len(ranks) == 2
    assert abs(sum(ranks.values()) - 1.0) < 1e-5
