"""Tests for the new Preferiti (favorites) feature.
Covers:
- POST /api/results/{id}/toggle-favorite (idempotent toggle)
- GET /api/results/favorites (ordering, filtering, no _id leak)
- Non-regression: POST /api/search/process default is_favorite=False
- Non-regression: DELETE /api/results/{id}, mark-viewed, delete-many
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://jarvis-assistant-603.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def created_search(api_client):
    """Create a real search via /search/process so we have result IDs to work with."""
    payload = {
        "query": "TEST_FAVORITES appartamento a Milano 3 locali max 300k",
        "category": "immobili",
        "language": "it",
    }
    r = api_client.post(f"{API}/search/process", json=payload, timeout=60)
    assert r.status_code == 200, f"process failed: {r.status_code} {r.text}"
    data = r.json()
    assert "search_id" in data and "results" in data and len(data["results"]) >= 1
    yield data
    # Cleanup
    try:
        api_client.delete(f"{API}/search/{data['search_id']}", timeout=15)
    except Exception:
        pass


# ---------- Non-regression: default is_favorite = False ----------
def test_process_search_defaults_is_favorite_false(created_search):
    for r in created_search["results"]:
        assert r.get("is_favorite") is False, f"Expected is_favorite=False, got {r.get('is_favorite')} on result {r['id']}"


# ---------- Toggle favorite idempotency ----------
def test_toggle_favorite_idempotent(api_client, created_search):
    rid = created_search["results"][0]["id"]

    r1 = api_client.post(f"{API}/results/{rid}/toggle-favorite", timeout=10)
    assert r1.status_code == 200, r1.text
    d1 = r1.json()
    assert d1["result_id"] == rid
    assert d1["is_favorite"] is True

    r2 = api_client.post(f"{API}/results/{rid}/toggle-favorite", timeout=10)
    assert r2.status_code == 200
    d2 = r2.json()
    assert d2["is_favorite"] is False

    r3 = api_client.post(f"{API}/results/{rid}/toggle-favorite", timeout=10)
    assert r3.status_code == 200
    d3 = r3.json()
    assert d3["is_favorite"] is True

    # Cleanup: untoggle so we don't leave it as favorite for later
    api_client.post(f"{API}/results/{rid}/toggle-favorite", timeout=10)


# ---------- 404 on invalid ID ----------
def test_toggle_favorite_404_invalid_id(api_client):
    r = api_client.post(f"{API}/results/aaaa-bbbb-invalid/toggle-favorite", timeout=10)
    assert r.status_code == 404, f"Expected 404, got {r.status_code}: {r.text}"


# ---------- GET /favorites: contents, ordering, no _id ----------
def test_get_favorites_lists_marked_only(api_client, created_search):
    results = created_search["results"]
    assert len(results) >= 2, "Need at least 2 results to run ordering test"

    r_first = results[0]["id"]
    r_second = results[1]["id"]

    # Mark both as favorite (with a tiny sleep to ensure created_at ordering behaves)
    api_client.post(f"{API}/results/{r_first}/toggle-favorite", timeout=10)
    api_client.post(f"{API}/results/{r_second}/toggle-favorite", timeout=10)

    resp = api_client.get(f"{API}/results/favorites", timeout=15)
    assert resp.status_code == 200
    favs = resp.json()
    assert isinstance(favs, list)

    # No MongoDB _id leak
    for f in favs:
        assert "_id" not in f, f"MongoDB _id leaked in response: {f}"
        # required serialized fields
        for key in ("id", "search_id", "title", "summary", "keywords", "source_link", "is_favorite", "created_at"):
            assert key in f, f"Missing field {key} in favorite"
        assert f["is_favorite"] is True

    ids_in_favs = [f["id"] for f in favs]
    assert r_first in ids_in_favs
    assert r_second in ids_in_favs

    # Verify DESC ordering by created_at
    if len(favs) >= 2:
        created_dates = [f["created_at"] for f in favs]
        assert created_dates == sorted(created_dates, reverse=True), "favorites not sorted by created_at DESC"

    # Un-toggle the first one and confirm it's excluded
    api_client.post(f"{API}/results/{r_first}/toggle-favorite", timeout=10)
    resp2 = api_client.get(f"{API}/results/favorites", timeout=15)
    assert resp2.status_code == 200
    favs2_ids = [f["id"] for f in resp2.json()]
    assert r_first not in favs2_ids
    assert r_second in favs2_ids

    # cleanup: unfav second too
    api_client.post(f"{API}/results/{r_second}/toggle-favorite", timeout=10)


# ---------- Non-regression: DELETE favorite result ----------
def test_delete_favorite_result_still_works(api_client, created_search):
    # Create an extra search to not disturb others
    r = api_client.post(f"{API}/search/process", json={
        "query": "TEST_FAV_DELETE mono a Roma",
        "category": "immobili",
        "language": "it",
    }, timeout=60)
    assert r.status_code == 200
    data = r.json()
    rid = data["results"][0]["id"]

    # Mark favorite
    tr = api_client.post(f"{API}/results/{rid}/toggle-favorite", timeout=10)
    assert tr.status_code == 200 and tr.json()["is_favorite"] is True

    # Delete it
    dr = api_client.delete(f"{API}/results/{rid}", timeout=10)
    assert dr.status_code == 200

    # Ensure it's gone from favorites
    favs = api_client.get(f"{API}/results/favorites", timeout=15).json()
    assert rid not in [f["id"] for f in favs]

    # cleanup search
    api_client.delete(f"{API}/search/{data['search_id']}", timeout=15)


# ---------- Non-regression: mark-viewed still works ----------
def test_mark_search_viewed_regression(api_client, created_search):
    sid = created_search["search_id"]
    r = api_client.post(f"{API}/searches/{sid}/mark-viewed", timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert body["search_id"] == sid
    assert "updated_count" in body


# ---------- Non-regression: delete-many results ----------
def test_delete_many_results_regression(api_client):
    # Create a search, then bulk delete its results
    r = api_client.post(f"{API}/search/process", json={
        "query": "TEST_BULK_DEL_FAV bilocale Napoli",
        "category": "immobili",
        "language": "it",
    }, timeout=60)
    assert r.status_code == 200
    data = r.json()
    ids = [x["id"] for x in data["results"]]
    assert len(ids) >= 1

    # Mark one as favorite before bulk delete, then bulk delete should still work
    api_client.post(f"{API}/results/{ids[0]}/toggle-favorite", timeout=10)

    dr = api_client.post(f"{API}/results/delete-many", json={"ids": ids}, timeout=15)
    assert dr.status_code == 200
    body = dr.json()
    assert body["deleted_count"] == len(ids)

    api_client.delete(f"{API}/search/{data['search_id']}", timeout=15)
