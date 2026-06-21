from sqlalchemy.orm import Session

from app.models.search import SearchLog
from app.routes.search import generate_snippet, parse_facets


def test_parse_facets():
    # Test type extraction
    q1, f1 = parse_facets("ACME invoice type:web")
    assert q1 == "ACME invoice"
    assert f1.get("type") == "WEB"

    # Test confidence condition extraction
    q2, f2 = parse_facets("part numbers confidence:>0.85")
    assert q2 == "part numbers"
    assert f2.get("confidence") == (">", 0.85)

    # Test vendor extraction
    q3, f3 = parse_facets("contract agreement vendor:Google")
    assert q3 == "contract agreement"
    assert f3.get("vendor") == "google"

def test_generate_snippet():
    text = "The total balance due for this statement is $145.50. Please send the payment to ACME Corp. The billing date is June 21, 2026."

    # Matching terms
    snippet1 = generate_snippet(text, "payment ACME")
    assert "<mark>payment</mark>" in snippet1 or "<mark>Payment</mark>" in snippet1
    assert "<mark>ACME</mark>" in snippet1

    # Fallback when no keywords match
    snippet2 = generate_snippet(text, "unrelated query terms")
    assert len(snippet2) > 0
    assert "<mark>" not in snippet2

def test_search_suggest_route(client, db_session: Session, auth_headers):
    # Seed SearchLogs
    log1 = SearchLog(query_text="invoice total due", results_count=3, latency_ms=10)
    log2 = SearchLog(query_text="invoice status approved", results_count=1, latency_ms=5)
    log3 = SearchLog(query_text="contract Gov law", results_count=2, latency_ms=8)

    db_session.add_all([log1, log2, log3])
    db_session.commit()

    # Call autocomplete API
    response = client.get("/api/search/suggest?q=inv", headers=auth_headers)
    assert response.status_code == 200
    sugs = response.json()
    assert len(sugs) > 0
    assert any("invoice" in s for s in sugs)
