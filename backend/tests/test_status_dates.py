"""Tests for the ATTIVO / posted_date / expiry_date feature and ordering."""
import os
import re
from datetime import datetime, timedelta

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "http://localhost:8001").rstrip("/")
DMY = re.compile(r"^\d{2}/\d{2}/\d{4}$")

# Snapshot of "today" used for filtering — the environment date is ~Jul 2026.
NOW = datetime.utcnow()


@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _parse(d):
    return datetime.strptime(d, "%d/%m/%Y")


def _process(api_client, query, category):
    resp = api_client.post(
        f"{BASE_URL}/api/search/process",
        json={"query": query, "category": category, "language": "it"},
        timeout=90,
    )
    assert resp.status_code == 200, f"POST /search/process {category}: {resp.status_code} {resp.text[:200]}"
    return resp.json()


def _get_results(api_client, search_id):
    resp = api_client.get(f"{BASE_URL}/api/search/{search_id}/results", timeout=30)
    assert resp.status_code == 200
    return resp.json()


# ---------- expiry OBBLIGATORIO ----------
@pytest.mark.parametrize("category,query", [
    ("gare_appalto", "Cerco bandi efficientamento energetico Sicilia"),
    ("bandi", "Cerco bandi di concorso pubblico amministrativi 2026"),
])
def test_expiry_required_categories(api_client, category, query):
    data = _process(api_client, query, category)
    results = data.get("results", [])
    assert results, f"{category}: no results returned"

    posted_dates = []
    for r in results:
        assert r.get("status") == "ATTIVO", f"{category}: status={r.get('status')}"
        pd = r.get("posted_date")
        ed = r.get("expiry_date")
        assert pd and DMY.match(pd), f"{category}: bad posted_date={pd}"
        assert ed and DMY.match(ed), f"{category}: expiry_date REQUIRED, got {ed}"

        pd_dt = _parse(pd)
        ed_dt = _parse(ed)
        # posted_date must be within ~last 60 days (allow small tolerance)
        assert pd_dt >= NOW - timedelta(days=75), f"{category}: posted_date too old {pd}"
        assert pd_dt <= NOW + timedelta(days=2), f"{category}: posted_date in future {pd}"
        # expiry_date must be in the future
        assert ed_dt > NOW - timedelta(days=1), f"{category}: expiry_date not future {ed}"
        posted_dates.append(pd_dt)

    # Ordering: posted_date DESC
    for i in range(len(posted_dates) - 1):
        assert posted_dates[i] >= posted_dates[i + 1], \
            f"{category}: results not sorted DESC by posted_date"


# ---------- expiry OPZIONALE ----------
@pytest.mark.parametrize("category,query", [
    ("immobili", "Cerco casa a Bologna bilocale entro 200000"),
    ("lavoro", "Cerco lavoro come sviluppatore backend Milano"),
    ("auto_moto", "Cerco Fiat Panda usata Torino sotto 8000 euro"),
])
def test_optional_expiry_categories(api_client, category, query):
    data = _process(api_client, query, category)
    results = data.get("results", [])
    assert results, f"{category}: no results"

    for r in results:
        assert r.get("status") == "ATTIVO", f"{category}: status={r.get('status')}"
        pd = r.get("posted_date")
        assert pd and DMY.match(pd), f"{category}: bad posted_date={pd}"
        pd_dt = _parse(pd)
        assert pd_dt >= NOW - timedelta(days=75), f"{category}: posted_date too old {pd}"

        snippet = (r.get("summary") or "").lower()
        for banned in ("scaduto", "chiuso", "ritirato"):
            assert banned not in snippet, f"{category}: banned word '{banned}' in snippet"


# ---------- Ordering via GET endpoint ----------
def test_get_results_sorted_by_posted_date_desc(api_client):
    data = _process(api_client, "Cerco fondi PNRR PMI Lombardia", "gare_appalto")
    search_id = data["search_id"]

    results = _get_results(api_client, search_id)
    assert len(results) >= 2, "need at least 2 results to verify ordering"

    prev = None
    for r in results:
        pd = r.get("posted_date")
        if pd:
            dt = _parse(pd)
            if prev is not None:
                assert dt <= prev, "GET results not sorted DESC by posted_date"
            prev = dt


# ---------- Retrocompatibilità: legacy result without posted_date ----------
def test_legacy_result_backward_compatible(api_client):
    """Insert a legacy record directly via search/create then check GET returns it fine."""
    # Create the parent search via API
    resp = api_client.post(
        f"{BASE_URL}/api/search/create",
        json={"query": "TEST_legacy_backward_compat", "category": "immobili", "language": "it"},
    )
    assert resp.status_code == 200
    search_id = resp.json()["id"]

    # We cannot insert legacy results via API — but the GET endpoint should still work
    # (empty list is a valid legacy-compat response).
    r = api_client.get(f"{BASE_URL}/api/search/{search_id}/results")
    assert r.status_code == 200
    assert isinstance(r.json(), list)

    # cleanup
    api_client.delete(f"{BASE_URL}/api/search/{search_id}")


# ---------- Non-regression ----------
def test_non_regression_favorite_and_delete(api_client):
    data = _process(api_client, "Cerco casa a Firenze bilocale", "immobili")
    results = data.get("results", [])
    assert results
    rid = results[0]["id"]

    # toggle favorite ON
    r = api_client.post(f"{BASE_URL}/api/results/{rid}/toggle-favorite")
    assert r.status_code == 200
    assert r.json()["is_favorite"] is True

    # toggle OFF
    r = api_client.post(f"{BASE_URL}/api/results/{rid}/toggle-favorite")
    assert r.status_code == 200
    assert r.json()["is_favorite"] is False

    # seller_type still populated (may be None if AI didn't return it but field must exist)
    assert "seller_type" in results[0]

    # delete result
    r = api_client.delete(f"{BASE_URL}/api/results/{rid}")
    assert r.status_code == 200

    # delete parent search
    api_client.delete(f"{BASE_URL}/api/search/{data['search_id']}")
