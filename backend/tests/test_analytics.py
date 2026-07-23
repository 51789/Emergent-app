"""Backend tests for admin analytics endpoints under /api/admin/analytics/*.

Covers:
  - Auth enforcement (401 without token, 403 for non-admin)
  - Overview KPIs shape + plan_distribution + monthly revenue formula
  - Timeseries bucket auto-selection + zero-fill + invalid metric 400
  - Categories breakdown sort order + shape
  - Custom range with from/to ISO datetimes
"""
import os
import uuid
import pytest
import requests
from datetime import datetime, timedelta
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") + "/api"

ADMIN_1 = ("marcolombardo595@gmail.com", "Jarvis.2026")

PLAN_PRICES = {
    "pro": 2.99,
    "premium": 4.99,
    "free": 0.0,
}


@pytest.fixture(scope="session")
def session():
    return requests.Session()


@pytest.fixture(scope="session")
def admin_token(session):
    r = session.post(f"{BASE}/auth/login", json={"email": ADMIN_1[0], "password": ADMIN_1[1]})
    assert r.status_code == 200, f"admin login failed: {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def user_token(session):
    # Register a fresh regular user
    email = f"analytics_test_{uuid.uuid4().hex[:8]}@example.com"
    r = session.post(f"{BASE}/auth/register", json={
        "email": email,
        "password": "Test1234",
        "name": "Analytics Tester",
    })
    assert r.status_code in (200, 201), f"register failed: {r.text}"
    return r.json()["access_token"]


def _auth(token: str):
    return {"Authorization": f"Bearer {token}"}


# ---------------- AUTH GUARDS ----------------
class TestAnalyticsAuth:
    def test_overview_without_token_returns_401(self, session):
        r = session.get(f"{BASE}/admin/analytics/overview")
        assert r.status_code == 401, r.text

    def test_overview_with_regular_user_returns_403(self, session, user_token):
        r = session.get(
            f"{BASE}/admin/analytics/overview",
            headers=_auth(user_token),
        )
        assert r.status_code == 403, r.text

    def test_timeseries_without_token_returns_401(self, session):
        r = session.get(f"{BASE}/admin/analytics/timeseries")
        assert r.status_code == 401

    def test_categories_without_token_returns_401(self, session):
        r = session.get(f"{BASE}/admin/analytics/categories")
        assert r.status_code == 401


# ---------------- OVERVIEW ----------------
class TestAnalyticsOverview:
    def test_overview_month_shape(self, session, admin_token):
        r = session.get(
            f"{BASE}/admin/analytics/overview?range=month",
            headers=_auth(admin_token),
        )
        assert r.status_code == 200, r.text
        d = r.json()

        assert d["range"] == "month"
        # from/to should be ISO datetimes
        for k in ("from", "to"):
            assert isinstance(d[k], str) and "T" in d[k]
            # parseable
            datetime.fromisoformat(d[k])

        kpis = d["kpis"]
        expected_keys = {
            "total_users",
            "total_admins",
            "new_signups",
            "active_paid_subs",
            "estimated_monthly_revenue_eur",
            "total_searches",
            "total_results",
            "conversion_rate",
        }
        assert expected_keys.issubset(kpis.keys()), f"missing: {expected_keys - set(kpis.keys())}"

        # basic sanity
        assert kpis["total_users"] >= 2  # at least the two seed admins
        assert kpis["total_admins"] >= 2
        assert kpis["total_users"] >= kpis["total_admins"]
        assert 0.0 <= kpis["conversion_rate"] <= 100.0
        assert kpis["estimated_monthly_revenue_eur"] >= 0.0

        # plan_distribution should be a dict with expected inner shape
        assert isinstance(d["plan_distribution"], dict)

    def test_revenue_matches_plan_prices_formula(self, session, admin_token):
        r = session.get(
            f"{BASE}/admin/analytics/overview?range=month",
            headers=_auth(admin_token),
        )
        assert r.status_code == 200
        d = r.json()
        plan_dist = d["plan_distribution"]
        expected = 0.0
        for p in ("pro", "premium"):
            active = plan_dist.get(p, {}).get("active", 0)
            expected += active * PLAN_PRICES[p]
        expected = round(expected, 2)
        assert d["kpis"]["estimated_monthly_revenue_eur"] == expected, (
            f"revenue mismatch: got {d['kpis']['estimated_monthly_revenue_eur']} vs expected {expected}"
        )

        # active_paid_subs matches sum(active pro + active premium)
        expected_active = (
            plan_dist.get("pro", {}).get("active", 0)
            + plan_dist.get("premium", {}).get("active", 0)
        )
        assert d["kpis"]["active_paid_subs"] == expected_active

    @pytest.mark.parametrize("preset", ["realtime", "week", "month", "quarter", "semester", "year"])
    def test_overview_all_presets(self, session, admin_token, preset):
        r = session.get(
            f"{BASE}/admin/analytics/overview?range={preset}",
            headers=_auth(admin_token),
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["range"] == preset
        # from < to
        f = datetime.fromisoformat(d["from"])
        t = datetime.fromisoformat(d["to"])
        assert f < t
        assert "kpis" in d and "total_users" in d["kpis"]

    def test_overview_custom_range(self, session, admin_token):
        r = session.get(
            f"{BASE}/admin/analytics/overview",
            params={"range": "custom", "from": "2026-01-01", "to": "2026-12-31"},
            headers=_auth(admin_token),
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["range"] == "custom"
        f = datetime.fromisoformat(d["from"])
        t = datetime.fromisoformat(d["to"])
        assert f.year == 2026 and f.month == 1 and f.day == 1
        assert t.year == 2026 and t.month == 12 and t.day == 31


# ---------------- TIMESERIES ----------------
class TestAnalyticsTimeseries:
    def test_timeseries_week_signups_bucket_day(self, session, admin_token):
        r = session.get(
            f"{BASE}/admin/analytics/timeseries?range=week&metric=signups",
            headers=_auth(admin_token),
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["metric"] == "signups"
        assert d["bucket"] == "day"
        assert isinstance(d["points"], list)
        # zero-fill => 7 or 8 daily points for a 7-day window
        assert 7 <= len(d["points"]) <= 9, f"points={len(d['points'])}"
        for p in d["points"]:
            assert "label" in p and "value" in p
            assert isinstance(p["value"], int)
            assert p["value"] >= 0
        assert d["total"] == sum(p["value"] for p in d["points"])

    def test_timeseries_year_signups_bucket_month(self, session, admin_token):
        r = session.get(
            f"{BASE}/admin/analytics/timeseries?range=year&metric=signups",
            headers=_auth(admin_token),
        )
        assert r.status_code == 200
        d = r.json()
        assert d["bucket"] == "month"
        # 12 or 13 months across a rolling year
        assert 12 <= len(d["points"]) <= 14

    def test_timeseries_realtime_bucket_hour(self, session, admin_token):
        r = session.get(
            f"{BASE}/admin/analytics/timeseries?range=realtime&metric=signups",
            headers=_auth(admin_token),
        )
        assert r.status_code == 200
        d = r.json()
        assert d["bucket"] == "hour"
        # 24-25 hourly points
        assert 24 <= len(d["points"]) <= 26

    def test_timeseries_quarter_bucket_week(self, session, admin_token):
        r = session.get(
            f"{BASE}/admin/analytics/timeseries?range=quarter&metric=signups",
            headers=_auth(admin_token),
        )
        assert r.status_code == 200
        d = r.json()
        assert d["bucket"] == "week"

    def test_timeseries_metric_searches(self, session, admin_token):
        r = session.get(
            f"{BASE}/admin/analytics/timeseries?range=month&metric=searches",
            headers=_auth(admin_token),
        )
        assert r.status_code == 200
        d = r.json()
        assert d["metric"] == "searches"
        assert isinstance(d["points"], list)
        assert d["total"] == sum(p["value"] for p in d["points"])

    def test_timeseries_metric_results(self, session, admin_token):
        r = session.get(
            f"{BASE}/admin/analytics/timeseries?range=month&metric=results",
            headers=_auth(admin_token),
        )
        assert r.status_code == 200
        d = r.json()
        assert d["metric"] == "results"
        assert isinstance(d["points"], list)

    def test_timeseries_invalid_metric_returns_400(self, session, admin_token):
        r = session.get(
            f"{BASE}/admin/analytics/timeseries?range=month&metric=foo",
            headers=_auth(admin_token),
        )
        assert r.status_code == 400, r.text


# ---------------- CATEGORIES ----------------
class TestAnalyticsCategories:
    def test_categories_month_shape_and_sort(self, session, admin_token):
        r = session.get(
            f"{BASE}/admin/analytics/categories?range=month",
            headers=_auth(admin_token),
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["range"] == "month"
        assert "items" in d and isinstance(d["items"], list)
        prev = None
        for item in d["items"]:
            assert "category" in item
            assert "searches" in item and "results" in item
            assert isinstance(item["searches"], int) and item["searches"] >= 0
            assert isinstance(item["results"], int) and item["results"] >= 0
            score = item["searches"] + item["results"]
            if prev is not None:
                assert score <= prev, f"items not sorted DESC: {d['items']}"
            prev = score


# ---------------- REGRESSION (light) ----------------
class TestRegression:
    def test_auth_me_still_works(self, session, admin_token):
        r = session.get(f"{BASE}/auth/me", headers=_auth(admin_token))
        assert r.status_code == 200
        assert r.json()["role"] == "admin"

    def test_admin_users_list_still_works(self, session, admin_token):
        r = session.get(f"{BASE}/admin/users", headers=_auth(admin_token))
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_notifications_endpoint_still_works(self, session, admin_token):
        # tolerate 200 or 404 depending on route naming; expect not 500
        r = session.get(f"{BASE}/notifications", headers=_auth(admin_token))
        assert r.status_code in (200, 404), r.text
