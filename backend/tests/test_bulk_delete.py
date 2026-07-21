"""Backend tests for bulk delete endpoints (searches & results)."""
import os
import time
import pytest
import requests

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") + "/api"
TIMEOUT = 60  # LLM can take a while


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _process(session, query, category):
    r = session.post(
        f"{BASE}/search/process",
        json={"query": query, "category": category, "language": "it"},
        timeout=TIMEOUT,
    )
    assert r.status_code == 200, f"process failed: {r.status_code} {r.text[:300]}"
    return r.json()


# ---------- health ----------
def test_health(session):
    r = session.get(f"{BASE}/health", timeout=10)
    assert r.status_code == 200
    assert r.json().get("status") == "healthy"


# ---------- bulk delete searches ----------
def test_bulk_delete_searches(session):
    ids = []
    for cat in ("immobili", "auto_moto", "lavoro"):
        data = _process(session, f"TEST_ {cat} query", cat)
        ids.append(data["search_id"])
    assert len(ids) == 3

    # delete first 2
    r = session.post(
        f"{BASE}/search/delete-many", json={"ids": ids[:2]}, timeout=15
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["deleted_count"] == 2
    assert body["requested_count"] == 2

    # verify the 3rd remains
    r = session.get(f"{BASE}/search/active", timeout=15)
    assert r.status_code == 200
    active_ids = {s["id"] for s in r.json()}
    assert ids[2] in active_ids
    assert ids[0] not in active_ids
    assert ids[1] not in active_ids

    # cleanup
    session.delete(f"{BASE}/search/{ids[2]}", timeout=15)


# ---------- bulk delete results ----------
def test_bulk_delete_results(session):
    data = _process(session, "TEST_ bulk results query casa Roma", "immobili")
    search_id = data["search_id"]

    r = session.get(f"{BASE}/search/{search_id}/results", timeout=15)
    assert r.status_code == 200
    results = r.json()
    assert len(results) >= 2, f"expected >=2 results, got {len(results)}"

    to_delete = [results[0]["id"], results[1]["id"]]
    r = session.post(
        f"{BASE}/results/delete-many", json={"ids": to_delete}, timeout=15
    )
    assert r.status_code == 200
    assert r.json()["deleted_count"] == 2

    r = session.get(f"{BASE}/search/{search_id}/results", timeout=15)
    remaining_ids = {x["id"] for x in r.json()}
    assert to_delete[0] not in remaining_ids
    assert to_delete[1] not in remaining_ids
    assert len(remaining_ids) == len(results) - 2

    session.delete(f"{BASE}/search/{search_id}", timeout=15)


# ---------- single delete result ----------
def test_single_delete_result_and_404(session):
    data = _process(session, "TEST_ single delete auto usata", "auto_moto")
    search_id = data["search_id"]
    results = data["results"]
    assert len(results) >= 1
    rid = results[0]["id"]

    r = session.delete(f"{BASE}/results/{rid}", timeout=15)
    assert r.status_code == 200
    assert r.json().get("result_id") == rid

    # second delete -> 404
    r = session.delete(f"{BASE}/results/{rid}", timeout=15)
    assert r.status_code == 404

    session.delete(f"{BASE}/search/{search_id}", timeout=15)


# ---------- empty ids -> 400 ----------
def test_empty_ids_400(session):
    r = session.post(f"{BASE}/search/delete-many", json={"ids": []}, timeout=15)
    assert r.status_code == 400

    r = session.post(f"{BASE}/results/delete-many", json={"ids": []}, timeout=15)
    assert r.status_code == 400


# ---------- non-regression: single search delete ----------
def test_single_delete_search_still_works(session):
    data = _process(session, "TEST_ single delete search", "lavoro")
    sid = data["search_id"]

    r = session.delete(f"{BASE}/search/{sid}", timeout=15)
    assert r.status_code == 200

    r = session.get(f"{BASE}/search/{sid}", timeout=15)
    assert r.status_code == 404
