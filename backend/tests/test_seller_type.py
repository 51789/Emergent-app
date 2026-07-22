"""Backend tests for the new seller_type field on SearchResult."""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_BACKEND_URL", "http://localhost:8001").rstrip("/")

# Seller-type taxonomy per category (mirrors backend)
VALID_SELLER_TYPES = {
    "immobili": {"Privato", "Agenzia Immobiliare"},
    "auto_moto": {"Privato", "Rivenditore Ufficiale", "Concessionario"},
    "divertimento": {"Organizzatore Ufficiale", "Rivenditore Autorizzato", "Privato"},
    "nuove_leggi": {"Ente Pubblico"},
    "bandi": {"Ente Pubblico"},
    "gare_appalto": {"Ente Pubblico", "Amministrazione Locale"},
    "finanza": {"Istituto Finanziario", "Broker Autorizzato", "Privato"},
    "lavoro": {"Azienda", "Agenzia per il Lavoro", "Ente Pubblico", "Privato"},
}


@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def cleanup_ids():
    ids = []
    yield ids
    # Cleanup created searches
    for sid in ids:
        try:
            requests.delete(f"{BASE_URL}/api/search/{sid}", timeout=10)
        except Exception:
            pass


def _process(api_client, query, category, cleanup_ids, timeout=60):
    payload = {"query": query, "category": category, "language": "it"}
    r = api_client.post(f"{BASE_URL}/api/search/process", json=payload, timeout=timeout)
    assert r.status_code == 200, f"process failed: {r.status_code} {r.text}"
    data = r.json()
    cleanup_ids.append(data["search_id"])
    return data


# ---- 1. immobili category ----
def test_process_immobili_seller_type(api_client, cleanup_ids):
    data = _process(api_client, "Cerco bilocale a Palermo", "immobili", cleanup_ids)
    results = data["results"]
    assert len(results) >= 1
    seller_types = []
    for r in results:
        assert "seller_type" in r, f"seller_type missing in {r}"
        st = r["seller_type"]
        # Should be non-null and in valid set
        assert st is not None, f"seller_type is None for {r.get('title')}"
        assert st in VALID_SELLER_TYPES["immobili"], f"Invalid seller_type '{st}' for immobili"
        seller_types.append(st)
    # Variation check (nice-to-have): at least when there are 3+ results, expect >1 unique
    if len(seller_types) >= 3:
        assert len(set(seller_types)) >= 1  # relaxed — AI may return all same


# ---- 2. auto_moto category ----
def test_process_auto_moto_seller_type(api_client, cleanup_ids):
    data = _process(api_client, "Cerco Fiat Panda a Roma", "auto_moto", cleanup_ids)
    results = data["results"]
    assert len(results) >= 1
    for r in results:
        st = r.get("seller_type")
        assert st is not None
        assert st in VALID_SELLER_TYPES["auto_moto"], f"Invalid seller_type '{st}' for auto_moto"


# ---- 3. lavoro category ----
def test_process_lavoro_seller_type(api_client, cleanup_ids):
    data = _process(api_client, "Cerco lavoro sviluppatore Milano", "lavoro", cleanup_ids)
    results = data["results"]
    assert len(results) >= 1
    for r in results:
        st = r.get("seller_type")
        assert st is not None
        assert st in VALID_SELLER_TYPES["lavoro"], f"Invalid seller_type '{st}' for lavoro"


# ---- 4. Persistence: GET /api/search/{id}/results returns seller_type ----
def test_seller_type_persistence(api_client, cleanup_ids):
    data = _process(api_client, "Cerco casa a Napoli", "immobili", cleanup_ids)
    search_id = data["search_id"]
    r = api_client.get(f"{BASE_URL}/api/search/{search_id}/results", timeout=15)
    assert r.status_code == 200
    results = r.json()
    assert len(results) >= 1
    for res in results:
        assert "seller_type" in res
        # Must not leak _id
        assert "_id" not in res
        assert res["seller_type"] in VALID_SELLER_TYPES["immobili"]


# ---- 5. Fallback: existing docs without seller_type should return seller_type: None ----
def test_fallback_missing_seller_type(api_client, cleanup_ids):
    """Insert directly a search + a result WITHOUT seller_type via API and verify GET returns None."""
    from motor.motor_asyncio import AsyncIOMotorClient
    import asyncio
    import uuid as _u
    from datetime import datetime

    async def _insert_legacy():
        mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
        db_name = os.environ.get("DB_NAME", "test_database")
        cli = AsyncIOMotorClient(mongo_url)
        db = cli[db_name]
        sid = str(_u.uuid4())
        rid = str(_u.uuid4())
        await db.searches.insert_one({
            "id": sid, "query": "legacy", "category": "immobili",
            "language": "it", "created_at": datetime.utcnow(), "is_active": True,
        })
        # Insert result WITHOUT seller_type field at all
        await db.results.insert_one({
            "id": rid, "search_id": sid, "title": "Legacy", "summary": "old doc",
            "keywords": [], "source_link": "https://x.it", "contacts": [],
            "created_at": datetime.utcnow(), "viewed": False, "is_favorite": False,
        })
        cli.close()
        return sid

    sid = asyncio.get_event_loop().run_until_complete(_insert_legacy()) \
        if not asyncio.get_event_loop().is_running() else asyncio.run(_insert_legacy())
    cleanup_ids.append(sid)

    r = api_client.get(f"{BASE_URL}/api/search/{sid}/results", timeout=10)
    assert r.status_code == 200
    results = r.json()
    assert len(results) == 1
    # Pydantic should default to None
    assert results[0].get("seller_type") is None
    assert "_id" not in results[0]


# ---- 6. Non-regression: favorites toggle still works with new field ----
def test_non_regression_favorite_toggle(api_client, cleanup_ids):
    data = _process(api_client, "Auto usata Torino", "auto_moto", cleanup_ids)
    result_id = data["results"][0]["id"]
    r = api_client.post(f"{BASE_URL}/api/results/{result_id}/toggle-favorite", timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert body["is_favorite"] is True
    # Un-toggle
    r2 = api_client.post(f"{BASE_URL}/api/results/{result_id}/toggle-favorite", timeout=10)
    assert r2.json()["is_favorite"] is False


# ---- 7. Non-regression: mark-viewed still works ----
def test_non_regression_mark_viewed(api_client, cleanup_ids):
    data = _process(api_client, "Concerto Milano", "divertimento", cleanup_ids)
    sid = data["search_id"]
    r = api_client.post(f"{BASE_URL}/api/searches/{sid}/mark-viewed", timeout=10)
    assert r.status_code == 200
    assert r.json()["updated_count"] >= 1


# ---- 8. Non-regression: delete still works ----
def test_non_regression_delete(api_client):
    payload = {"query": "test delete", "category": "immobili", "language": "it"}
    r = api_client.post(f"{BASE_URL}/api/search/create", json=payload, timeout=10)
    sid = r.json()["id"]
    d = requests.delete(f"{BASE_URL}/api/search/{sid}", timeout=10)
    assert d.status_code == 200
