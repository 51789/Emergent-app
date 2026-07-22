"""Tests for the new notification bell + per-category counts feature."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://jarvis-assistant-603.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture
def created_ids():
    ids = []
    yield ids
    # cleanup
    if ids:
        try:
            requests.post(f"{API}/search/delete-many", json={"ids": ids}, timeout=30)
        except Exception:
            pass


# ----- Notifications count endpoint -----
class TestUnviewedCount:
    def test_returns_shape(self, session):
        r = session.get(f"{API}/notifications/unviewed-count", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "total" in data and isinstance(data["total"], int)
        assert "per_category" in data and isinstance(data["per_category"], dict)

    def test_increments_after_process(self, session, created_ids):
        before = session.get(f"{API}/notifications/unviewed-count", timeout=30).json()
        before_total = before["total"]
        before_immobili = before["per_category"].get("immobili", 0)

        # Create a search on immobili
        r = session.post(f"{API}/search/process",
                         json={"query": "TEST_casa Roma", "category": "immobili", "language": "it"},
                         timeout=60)
        assert r.status_code == 200
        payload = r.json()
        search_id = payload["search_id"]
        created_ids.append(search_id)
        # results must default to viewed=False
        assert len(payload["results"]) > 0
        for res in payload["results"]:
            assert res.get("viewed") is False

        after = session.get(f"{API}/notifications/unviewed-count", timeout=30).json()
        assert after["total"] > before_total
        assert after["per_category"].get("immobili", 0) > before_immobili

    def test_multiple_categories_present(self, session, created_ids):
        r1 = session.post(f"{API}/search/process",
                          json={"query": "TEST_appartamento Torino", "category": "immobili", "language": "it"},
                          timeout=60)
        assert r1.status_code == 200
        created_ids.append(r1.json()["search_id"])

        r2 = session.post(f"{API}/search/process",
                          json={"query": "TEST_moto usata Milano", "category": "auto_moto", "language": "it"},
                          timeout=60)
        assert r2.status_code == 200
        created_ids.append(r2.json()["search_id"])

        data = session.get(f"{API}/notifications/unviewed-count", timeout=30).json()
        assert data["per_category"].get("immobili", 0) > 0
        assert data["per_category"].get("auto_moto", 0) > 0


# ----- Mark viewed endpoint -----
class TestMarkViewed:
    def test_mark_viewed_flow(self, session, created_ids):
        r = session.post(f"{API}/search/process",
                         json={"query": "TEST_mark-viewed flow", "category": "divertimento", "language": "it"},
                         timeout=60)
        assert r.status_code == 200
        sid = r.json()["search_id"]
        created_ids.append(sid)

        before = session.get(f"{API}/notifications/unviewed-count", timeout=30).json()
        before_total = before["total"]

        # First mark-viewed call → should update > 0
        m = session.post(f"{API}/searches/{sid}/mark-viewed", timeout=30)
        assert m.status_code == 200
        body = m.json()
        assert body["search_id"] == sid
        assert body["updated_count"] > 0

        after = session.get(f"{API}/notifications/unviewed-count", timeout=30).json()
        assert after["total"] < before_total

        # Verify persistence via GET results
        results = session.get(f"{API}/search/{sid}/results", timeout=30).json()
        assert all(res["viewed"] is True for res in results)

        # Idempotency: second call → updated_count = 0
        m2 = session.post(f"{API}/searches/{sid}/mark-viewed", timeout=30)
        assert m2.status_code == 200
        assert m2.json()["updated_count"] == 0


# ----- Active search counts per category -----
class TestActiveCounts:
    def test_shape(self, session):
        r = session.get(f"{API}/search/active/counts", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "total" in data and isinstance(data["total"], int)
        assert "per_category" in data and isinstance(data["per_category"], dict)
        # total must equal sum of per_category values
        assert data["total"] == sum(data["per_category"].values())
        # no category should have count 0
        assert all(v > 0 for v in data["per_category"].values())

    def test_counts_reflect_creates_and_deletes(self, session):
        before = session.get(f"{API}/search/active/counts", timeout=30).json()
        before_total = before["total"]
        before_immo = before["per_category"].get("immobili", 0)
        before_auto = before["per_category"].get("auto_moto", 0)

        ids = []
        # 1 immobili + 2 auto_moto
        r1 = session.post(f"{API}/search/create",
                          json={"query": "TEST_immo1", "category": "immobili", "language": "it"}, timeout=30)
        ids.append(r1.json()["id"])
        r2 = session.post(f"{API}/search/create",
                          json={"query": "TEST_auto1", "category": "auto_moto", "language": "it"}, timeout=30)
        ids.append(r2.json()["id"])
        r3 = session.post(f"{API}/search/create",
                          json={"query": "TEST_auto2", "category": "auto_moto", "language": "it"}, timeout=30)
        ids.append(r3.json()["id"])

        mid = session.get(f"{API}/search/active/counts", timeout=30).json()
        assert mid["total"] == before_total + 3
        assert mid["per_category"].get("immobili", 0) == before_immo + 1
        assert mid["per_category"].get("auto_moto", 0) == before_auto + 2

        # Delete one auto_moto → total -1, auto_moto -1
        d = session.delete(f"{API}/search/{ids[1]}", timeout=30)
        assert d.status_code == 200

        after = session.get(f"{API}/search/active/counts", timeout=30).json()
        assert after["total"] == before_total + 2
        assert after["per_category"].get("auto_moto", 0) == before_auto + 1

        # cleanup remaining
        session.post(f"{API}/search/delete-many", json={"ids": [ids[0], ids[2]]}, timeout=30)


# ----- Non-regression -----
class TestNonRegression:
    def test_process_creates_unviewed_results(self, session, created_ids):
        r = session.post(f"{API}/search/process",
                         json={"query": "TEST_regression", "category": "lavoro", "language": "it"},
                         timeout=60)
        assert r.status_code == 200
        sid = r.json()["search_id"]
        created_ids.append(sid)
        results = session.get(f"{API}/search/{sid}/results", timeout=30).json()
        assert len(results) > 0
        assert all(res["viewed"] is False for res in results)

    def test_delete_search_and_delete_many_still_work(self, session):
        r1 = session.post(f"{API}/search/create",
                          json={"query": "TEST_del1", "category": "finanza", "language": "it"}, timeout=30)
        r2 = session.post(f"{API}/search/create",
                          json={"query": "TEST_del2", "category": "finanza", "language": "it"}, timeout=30)
        id1 = r1.json()["id"]
        id2 = r2.json()["id"]

        d = session.delete(f"{API}/search/{id1}", timeout=30)
        assert d.status_code == 200

        d2 = session.post(f"{API}/search/delete-many", json={"ids": [id2]}, timeout=30)
        assert d2.status_code == 200
        assert d2.json()["deleted_count"] == 1
