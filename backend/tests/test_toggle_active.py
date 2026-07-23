"""Backend tests for the NEW toggle-active endpoints (deactivate without deleting).

Endpoints under test:
  - PATCH /api/search/{id}/toggle-active?is_active=<bool>
  - POST  /api/search/toggle-active-many  body: {ids: [str], is_active: bool}

Contract from iteration 10:
  - Deactivating a search sets `is_active=false` but PRESERVES the search doc
    AND its historical `results` collection entries.
  - GET /api/search/{id}          still returns the search doc.
  - GET /api/search/active        no longer includes deactivated ones.
  - GET /api/search/active/counts drops the total accordingly.
  - GET /api/search/{id}/results  still returns the persisted results.
"""
import os
import uuid
import pytest
import requests

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") + "/api"
TIMEOUT = 60  # /search/process uses the LLM


# ---------------- fixtures ----------------
@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _create_search(session, query_suffix, category):
    """Fast path: /search/create only stores the doc (no LLM), enough for
    toggle-active testing."""
    r = session.post(
        f"{BASE}/search/create",
        json={"query": f"TEST_toggle_{query_suffix}_{uuid.uuid4().hex[:6]}", "category": category, "language": "it"},
        timeout=15,
    )
    assert r.status_code == 200, f"create failed: {r.status_code} {r.text[:300]}"
    return r.json()


def _process_search(session, query_suffix, category):
    """Full path: /search/process — needed to have real results persisted."""
    r = session.post(
        f"{BASE}/search/process",
        json={"query": f"TEST_toggle_{query_suffix}_casa Milano 200000", "category": category, "language": "it"},
        timeout=TIMEOUT,
    )
    assert r.status_code == 200, f"process failed: {r.status_code} {r.text[:300]}"
    return r.json()


# ------------- health first -------------
def test_health(session):
    r = session.get(f"{BASE}/health", timeout=10)
    assert r.status_code == 200
    assert r.json().get("status") == "healthy"


# ---------------- single toggle ----------------
class TestSingleToggle:
    """PATCH /api/search/{id}/toggle-active?is_active=<bool>"""

    def test_deactivate_sets_is_active_false(self, session):
        s = _create_search(session, "single_deact", "immobili")
        sid = s["id"]
        try:
            r = session.patch(f"{BASE}/search/{sid}/toggle-active", params={"is_active": "false"}, timeout=15)
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["search_id"] == sid
            assert body["is_active"] is False

            # verify persistence via GET
            r = session.get(f"{BASE}/search/{sid}", timeout=15)
            assert r.status_code == 200
            assert r.json()["is_active"] is False
        finally:
            session.delete(f"{BASE}/search/{sid}", timeout=15)

    def test_reactivate_sets_is_active_true(self, session):
        s = _create_search(session, "single_react", "lavoro")
        sid = s["id"]
        try:
            # first deactivate
            session.patch(f"{BASE}/search/{sid}/toggle-active", params={"is_active": "false"}, timeout=15)
            # then reactivate
            r = session.patch(f"{BASE}/search/{sid}/toggle-active", params={"is_active": "true"}, timeout=15)
            assert r.status_code == 200
            assert r.json()["is_active"] is True

            r = session.get(f"{BASE}/search/{sid}", timeout=15)
            assert r.status_code == 200
            assert r.json()["is_active"] is True
        finally:
            session.delete(f"{BASE}/search/{sid}", timeout=15)

    def test_nonexistent_id_returns_404(self, session):
        fake_id = f"nonexistent-{uuid.uuid4()}"
        r = session.patch(f"{BASE}/search/{fake_id}/toggle-active", params={"is_active": "false"}, timeout=15)
        assert r.status_code == 404

    def test_deactivated_search_disappears_from_active_list(self, session):
        s = _create_search(session, "active_list", "auto_moto")
        sid = s["id"]
        try:
            # sanity: initially in /search/active
            r = session.get(f"{BASE}/search/active", timeout=15)
            assert r.status_code == 200
            assert sid in {x["id"] for x in r.json()}

            # deactivate
            r = session.patch(f"{BASE}/search/{sid}/toggle-active", params={"is_active": "false"}, timeout=15)
            assert r.status_code == 200

            # no longer in /search/active
            r = session.get(f"{BASE}/search/active", timeout=15)
            assert r.status_code == 200
            assert sid not in {x["id"] for x in r.json()}

            # but still retrievable by direct GET (data preserved)
            r = session.get(f"{BASE}/search/{sid}", timeout=15)
            assert r.status_code == 200
        finally:
            session.delete(f"{BASE}/search/{sid}", timeout=15)

    def test_deactivate_drops_active_counts_total(self, session):
        # baseline
        r = session.get(f"{BASE}/search/active/counts", timeout=15)
        assert r.status_code == 200
        base_total = r.json()["total"]
        base_cat = r.json()["per_category"].get("finanza", 0)

        s = _create_search(session, "counts", "finanza")
        sid = s["id"]
        try:
            r = session.get(f"{BASE}/search/active/counts", timeout=15)
            after_create_total = r.json()["total"]
            after_create_cat = r.json()["per_category"].get("finanza", 0)
            assert after_create_total == base_total + 1
            assert after_create_cat == base_cat + 1

            # deactivate
            session.patch(f"{BASE}/search/{sid}/toggle-active", params={"is_active": "false"}, timeout=15)

            r = session.get(f"{BASE}/search/active/counts", timeout=15)
            after_deact_total = r.json()["total"]
            after_deact_cat = r.json()["per_category"].get("finanza", 0)
            assert after_deact_total == base_total
            assert after_deact_cat == base_cat
        finally:
            session.delete(f"{BASE}/search/{sid}", timeout=15)

    def test_default_is_active_true_when_missing_param(self, session):
        """Signature says is_active: bool = True — omitting the param should
        toggle back to True on a deactivated search."""
        s = _create_search(session, "default_true", "divertimento")
        sid = s["id"]
        try:
            session.patch(f"{BASE}/search/{sid}/toggle-active", params={"is_active": "false"}, timeout=15)
            # now call without params
            r = session.patch(f"{BASE}/search/{sid}/toggle-active", timeout=15)
            assert r.status_code == 200
            assert r.json()["is_active"] is True
        finally:
            session.delete(f"{BASE}/search/{sid}", timeout=15)


# ---------------- bulk toggle ----------------
class TestBulkToggle:
    """POST /api/search/toggle-active-many"""

    def test_bulk_deactivate(self, session):
        ids = []
        for cat in ("immobili", "auto_moto", "lavoro"):
            ids.append(_create_search(session, f"bulk_deact_{cat}", cat)["id"])
        try:
            r = session.post(
                f"{BASE}/search/toggle-active-many",
                json={"ids": ids, "is_active": False},
                timeout=15,
            )
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["matched_count"] == 3
            assert body["modified_count"] == 3
            assert body["is_active"] is False

            # /search/active must not contain any of them anymore
            r = session.get(f"{BASE}/search/active", timeout=15)
            active_ids = {x["id"] for x in r.json()}
            for sid in ids:
                assert sid not in active_ids
                # but the doc itself is still reachable
                got = session.get(f"{BASE}/search/{sid}", timeout=15)
                assert got.status_code == 200
                assert got.json()["is_active"] is False
        finally:
            session.post(f"{BASE}/search/delete-many", json={"ids": ids}, timeout=15)

    def test_bulk_reactivate(self, session):
        ids = [
            _create_search(session, "bulk_react_a", "bandi")["id"],
            _create_search(session, "bulk_react_b", "gare_appalto")["id"],
        ]
        try:
            # first deactivate
            session.post(
                f"{BASE}/search/toggle-active-many",
                json={"ids": ids, "is_active": False},
                timeout=15,
            )
            # then reactivate in bulk
            r = session.post(
                f"{BASE}/search/toggle-active-many",
                json={"ids": ids, "is_active": True},
                timeout=15,
            )
            assert r.status_code == 200
            body = r.json()
            assert body["matched_count"] == 2
            assert body["modified_count"] == 2
            assert body["is_active"] is True

            r = session.get(f"{BASE}/search/active", timeout=15)
            active_ids = {x["id"] for x in r.json()}
            for sid in ids:
                assert sid in active_ids
        finally:
            session.post(f"{BASE}/search/delete-many", json={"ids": ids}, timeout=15)

    def test_bulk_empty_ids_returns_400(self, session):
        r = session.post(
            f"{BASE}/search/toggle-active-many",
            json={"ids": [], "is_active": False},
            timeout=15,
        )
        assert r.status_code == 400

    def test_bulk_unknown_ids_matched_zero(self, session):
        fake_ids = [f"nope-{uuid.uuid4()}" for _ in range(3)]
        r = session.post(
            f"{BASE}/search/toggle-active-many",
            json={"ids": fake_ids, "is_active": False},
            timeout=15,
        )
        # per contract: no HTTPException raised, matched=0 is fine
        assert r.status_code == 200
        body = r.json()
        assert body["matched_count"] == 0
        assert body["modified_count"] == 0

    def test_bulk_missing_is_active_returns_422(self, session):
        r = session.post(
            f"{BASE}/search/toggle-active-many",
            json={"ids": ["x"]},
            timeout=15,
        )
        assert r.status_code == 422


# ---------------- data preservation ----------------
class TestDataPreservation:
    """The whole point of this iteration: deactivate ≠ delete."""

    def test_results_are_preserved_after_deactivation(self, session):
        data = _process_search(session, "preserve", "immobili")
        sid = data["search_id"]
        try:
            # baseline: results exist
            r = session.get(f"{BASE}/search/{sid}/results", timeout=15)
            assert r.status_code == 200
            baseline_results = r.json()
            assert len(baseline_results) >= 1
            baseline_ids = {x["id"] for x in baseline_results}

            # deactivate
            r = session.patch(f"{BASE}/search/{sid}/toggle-active", params={"is_active": "false"}, timeout=15)
            assert r.status_code == 200

            # search doc still exists
            r = session.get(f"{BASE}/search/{sid}", timeout=15)
            assert r.status_code == 200
            assert r.json()["is_active"] is False

            # results still accessible and identical
            r = session.get(f"{BASE}/search/{sid}/results", timeout=15)
            assert r.status_code == 200
            after_results = r.json()
            after_ids = {x["id"] for x in after_results}
            assert after_ids == baseline_ids, "Results must be preserved after deactivation"
        finally:
            session.delete(f"{BASE}/search/{sid}", timeout=15)


# ---------------- regression: existing search endpoints ----------------
class TestRegressionSearchEndpoints:
    def test_create_and_delete_still_work(self, session):
        s = _create_search(session, "reg_create_del", "lavoro")
        sid = s["id"]
        assert s["is_active"] is True

        r = session.delete(f"{BASE}/search/{sid}", timeout=15)
        assert r.status_code == 200

        r = session.get(f"{BASE}/search/{sid}", timeout=15)
        assert r.status_code == 404

    def test_delete_many_still_works(self, session):
        ids = [
            _create_search(session, "reg_delm_a", "immobili")["id"],
            _create_search(session, "reg_delm_b", "auto_moto")["id"],
        ]
        r = session.post(f"{BASE}/search/delete-many", json={"ids": ids}, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["deleted_count"] == 2

        for sid in ids:
            r = session.get(f"{BASE}/search/{sid}", timeout=15)
            assert r.status_code == 404

    def test_active_counts_endpoint_shape(self, session):
        r = session.get(f"{BASE}/search/active/counts", timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert "total" in body and isinstance(body["total"], int)
        assert "per_category" in body and isinstance(body["per_category"], dict)
