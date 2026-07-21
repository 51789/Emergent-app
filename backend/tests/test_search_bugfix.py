"""
Backend tests for JARVIS search bug fix:
- verifies AI-generated context-aware search results honor user's query (location, budget)
- verifies DELETE removes both search and its results
"""
import os
import re
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://jarvis-assistant-603.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ----------- Health -----------
def test_health(api_client):
    r = api_client.get(f"{API}/health", timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("status") == "healthy"
    assert body.get("llm_configured") is True, "EMERGENT_LLM_KEY must be configured"


# ----------- Bug fix core: Alcamo search -----------
def _text_from_results(data):
    parts = []
    for res in data.get("results", []):
        parts.append(res.get("title", ""))
        parts.append(res.get("summary", ""))
        for c in (res.get("contacts") or []):
            parts.append(str(c))
        parts.append(res.get("source_link", ""))
    return " ".join(parts)


def test_alcamo_search_returns_alcamo_not_torino(api_client):
    payload = {
        "query": "Cerco casa in vendita ad Alcamo, bilocale, budget 80000 euro",
        "category": "immobili",
        "language": "it",
    }
    r = api_client.post(f"{API}/search/process", json=payload, timeout=120)
    assert r.status_code == 200, r.text
    data = r.json()

    assert data.get("note", "").lower().startswith("ai-generated"), f"Unexpected note: {data.get('note')}"
    assert data.get("search_id")
    results = data.get("results", [])
    assert len(results) >= 1, "Should return at least 1 result"

    text = _text_from_results(data).lower()

    # Must NOT mention Torino
    assert "torino" not in text, f"BUG NOT FIXED: results mention Torino. Text: {text[:500]}"

    # Must mention Alcamo (either in title/snippet or use it as fallback query text)
    assert "alcamo" in text, f"Results should mention Alcamo. Text: {text[:500]}"

    # Check torino phone prefix "011" is absent as a phone prefix
    # Allow for zip 91011 or similar; check contacts specifically for +39 011 or 011/ style
    for res in results:
        for c in (res.get("contacts") or []):
            c_lower = str(c).lower()
            assert "+39 011" not in c_lower and not re.search(r"\b011[\s/-]?\d", c_lower), \
                f"Found Torino phone prefix in contact: {c}"

    # Budget check: any 6-digit price >= 200000 would clearly exceed 80k
    # Extract numbers >= 100000 from snippets and titles (ignoring years like 2024)
    combined = " ".join(res.get("title", "") + " " + res.get("summary", "") for res in results)
    # find price patterns like 250.000 or 250000 €
    price_candidates = re.findall(r"(\d[\d\.\s]{4,})\s*(?:€|euro|EUR)", combined, flags=re.IGNORECASE)
    for pc in price_candidates:
        num = int(re.sub(r"[^\d]", "", pc))
        if 10000 <= num <= 10_000_000:
            assert num <= 120000, f"Price {num} exceeds ~80k budget significantly: {pc}"


def test_milano_navigli_search_returns_milano(api_client):
    payload = {
        "query": "Cerco appartamento a Milano zona Navigli, 3 locali, 300000 euro",
        "category": "immobili",
        "language": "it",
    }
    r = api_client.post(f"{API}/search/process", json=payload, timeout=120)
    assert r.status_code == 200, r.text
    data = r.json()
    text = _text_from_results(data).lower()
    assert "milano" in text or "navigli" in text, f"Milano/Navigli missing. Text: {text[:500]}"
    assert "torino" not in text, f"Should not mention Torino. Text: {text[:500]}"


def test_roma_job_search_returns_roma(api_client):
    payload = {
        "query": "Cerco lavoro come sviluppatore a Roma",
        "category": "lavoro",
        "language": "it",
    }
    r = api_client.post(f"{API}/search/process", json=payload, timeout=120)
    assert r.status_code == 200, r.text
    data = r.json()
    text = _text_from_results(data).lower()
    assert "roma" in text, f"Roma missing in job search. Text: {text[:500]}"


# ----------- DELETE search flow -----------
def test_delete_search_removes_search_and_results(api_client):
    # Create
    payload = {
        "query": "TEST_DELETE Cerco casa in vendita ad Alcamo bilocale 70000 euro",
        "category": "immobili",
        "language": "it",
    }
    r = api_client.post(f"{API}/search/process", json=payload, timeout=120)
    assert r.status_code == 200, r.text
    data = r.json()
    search_id = data["search_id"]
    assert search_id

    # Confirm exists in active
    r_active = api_client.get(f"{API}/search/active", timeout=30)
    assert r_active.status_code == 200
    assert any(s["id"] == search_id for s in r_active.json()), "Newly created search not in active list"

    # Confirm results exist
    r_res = api_client.get(f"{API}/search/{search_id}/results", timeout=30)
    assert r_res.status_code == 200
    assert len(r_res.json()) >= 1, "Should have >=1 result before delete"

    # DELETE
    r_del = api_client.delete(f"{API}/search/{search_id}", timeout=30)
    assert r_del.status_code == 200, r_del.text
    body = r_del.json()
    assert "deleted successfully" in body.get("message", "").lower(), body

    # Verify results removed
    r_res2 = api_client.get(f"{API}/search/{search_id}/results", timeout=30)
    assert r_res2.status_code == 200
    assert r_res2.json() == [], "Results should be empty after delete"

    # Verify search not in active
    r_active2 = api_client.get(f"{API}/search/active", timeout=30)
    assert r_active2.status_code == 200
    assert not any(s["id"] == search_id for s in r_active2.json()), "Deleted search still in active list"

    # Verify GET /search/{id} returns 404
    r_get = api_client.get(f"{API}/search/{search_id}", timeout=30)
    assert r_get.status_code == 404


def test_delete_nonexistent_returns_404(api_client):
    r = api_client.delete(f"{API}/search/nonexistent-id-xyz", timeout=30)
    assert r.status_code == 404
