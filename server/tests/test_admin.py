from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import update

from app.categories import CATEGORY_IDS
from app.core.errors import AppError
from app.db.models import Subscription, User
from app.modules.admin import service as admin_service
from app.modules.admin.analytics import resolve_range
from tests.conftest import WEBHOOK_SECRET, make_admin, register, set_user
from tests.fakes import sign_stripe_payload, stripe_event

ADMIN_ENDPOINTS = [
    ("GET", "/admin/users", None),
    ("POST", "/admin/users", {"email": "z@consulens-test.com", "password": "password123"}),
    ("PATCH", f"/admin/users/{uuid.uuid4()}", {"name": "x"}),
    ("DELETE", f"/admin/users/{uuid.uuid4()}", None),
    ("GET", "/admin/analytics/overview", None),
    ("GET", "/admin/analytics/timeseries", None),
    ("GET", "/admin/analytics/categories", None),
]


@pytest.mark.parametrize(("method", "path", "body"), ADMIN_ENDPOINTS)
async def test_admin_endpoints_require_admin(client, user_a, method, path, body):
    anonymous = await client.request(method, path, json=body)
    assert anonymous.status_code == 401
    response = await client.request(method, path, json=body, headers=user_a["headers"])
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "forbidden"


async def test_admin_user_crud(client, sessionmaker):
    admin = await make_admin(client, sessionmaker)
    h = admin["headers"]
    created = await client.post(
        "/admin/users",
        headers=h,
        json={
            "email": "Staff@Consulens-Test.com",
            "password": "password123",
            "name": "Staff",
            "role": "admin",
            "plan": "pro",
        },
    )
    assert created.status_code == 201
    staff = created.json()
    assert (staff["email"], staff["role"], staff["plan"]) == (
        "staff@consulens-test.com",
        "admin",
        "pro",
    )
    dup = await client.post(
        "/admin/users",
        headers=h,
        json={"email": "staff@consulens-test.com", "password": "password123"},
    )
    assert dup.status_code == 409

    await register(client, "customer@consulens-test.com")
    listed = (await client.get("/admin/users?q=CUSTOMER", headers=h)).json()
    assert [u["email"] for u in listed["items"]] == ["customer@consulens-test.com"]
    page = (await client.get("/admin/users?limit=2", headers=h)).json()
    assert len(page["items"]) == 2 and page["next_cursor"]
    rest = (
        await client.get(f"/admin/users?limit=2&cursor={page['next_cursor']}", headers=h)
    ).json()
    assert len(rest["items"]) == 1 and rest["next_cursor"] is None
    assert (await client.get("/admin/users?q=%25", headers=h)).json()["items"] == []

    login = await client.post(
        "/auth/login", json={"email": "staff@consulens-test.com", "password": "password123"}
    )
    old_refresh = login.json()["refresh_token"]
    patched = await client.patch(
        f"/admin/users/{staff['id']}",
        headers=h,
        json={
            "email": "staff2@consulens-test.com",
            "password": "newpassword1",
            "name": None,
            "role": "user",
            "plan": "premium",
        },
    )
    assert patched.status_code == 200, patched.text
    body = patched.json()
    assert (body["email"], body["role"], body["plan"], body["name"]) == (
        "staff2@consulens-test.com",
        "user",
        "premium",
        None,
    )
    # Password change revokes existing sessions.
    assert (
        await client.post("/auth/refresh", json={"refresh_token": old_refresh})
    ).status_code == 401
    assert (
        await client.post(
            "/auth/login", json={"email": "staff2@consulens-test.com", "password": "newpassword1"}
        )
    ).status_code == 200

    taken = await client.patch(
        f"/admin/users/{staff['id']}", headers=h, json={"email": "customer@consulens-test.com"}
    )
    assert taken.status_code == 409
    assert (
        await client.patch(f"/admin/users/{uuid.uuid4()}", headers=h, json={"name": "x"})
    ).status_code == 404

    deleted = await client.delete(f"/admin/users/{staff['id']}", headers=h)
    assert deleted.status_code == 204
    assert (await client.delete(f"/admin/users/{staff['id']}", headers=h)).status_code == 404


async def test_admin_cannot_demote_or_delete_self(client, sessionmaker):
    admin = await make_admin(client, sessionmaker)
    uid = admin["user"]["id"]
    demote = await client.patch(
        f"/admin/users/{uid}", headers=admin["headers"], json={"role": "user"}
    )
    assert demote.status_code == 400
    assert demote.json()["error"]["code"] == "cannot_demote_self"
    delete = await client.delete(f"/admin/users/{uid}", headers=admin["headers"])
    assert delete.status_code == 400
    assert delete.json()["error"]["code"] == "cannot_delete_self"


async def test_last_admin_is_protected(client, sessionmaker, settings):
    only_admin = await make_admin(client, sessionmaker)
    # A requester whose admin role was revoked concurrently must not remove the last admin.
    stale = User(id=uuid.uuid4(), email="stale@consulens-test.com", role="admin")
    async with sessionmaker() as session:
        with pytest.raises(AppError) as info:
            await admin_service.delete_user(
                session, stale, uuid.UUID(only_admin["user"]["id"]), None
            )
    assert info.value.code == "last_admin"
    async with sessionmaker() as session:
        from app.modules.admin.schemas import AdminUserUpdateIn

        with pytest.raises(AppError) as info:
            await admin_service.update_user(
                session,
                settings,
                stale,
                uuid.UUID(only_admin["user"]["id"]),
                AdminUserUpdateIn(role="user"),
            )
    assert info.value.code == "last_admin"

    # With two admins, one may demote the other.
    second = await make_admin(client, sessionmaker)
    ok = await client.patch(
        f"/admin/users/{second['user']['id']}", headers=only_admin["headers"], json={"role": "user"}
    )
    assert ok.status_code == 200 and ok.json()["role"] == "user"


@pytest.mark.parametrize("range_key", ["realtime", "7d", "30d", "90d", "180d", "365d"])
async def test_analytics_shapes(client, sessionmaker, range_key):
    admin = await make_admin(client, sessionmaker)
    h = admin["headers"]
    overview = await client.get(f"/admin/analytics/overview?range={range_key}", headers=h)
    assert overview.status_code == 200
    body = overview.json()
    assert set(body) == {
        "range",
        "revenue_monthly_estimate_cents",
        "active_subscribers",
        "new_signups",
        "conversion_rate",
        "plan_split",
        "total_users",
        "total_searches",
    }
    assert set(body["range"]) == {"from", "to"}
    assert set(body["plan_split"]) == {"free", "pro", "premium"}

    for metric in ("signups", "searches", "subscriptions"):
        series = await client.get(
            f"/admin/analytics/timeseries?range={range_key}&metric={metric}", headers=h
        )
        assert series.status_code == 200
        data = series.json()
        assert data["bucket"] in ("hour", "day", "week", "month")
        assert data["points"] and set(data["points"][0]) == {"t", "value"}

    categories = (
        await client.get(f"/admin/analytics/categories?range={range_key}", headers=h)
    ).json()
    assert {i["category"] for i in categories["items"]} == set(CATEGORY_IDS)


async def test_analytics_values(client, sessionmaker):
    admin = await make_admin(client, sessionmaker)
    h = admin["headers"]
    pro = await register(client)
    premium = await register(client)
    await register(client)  # free
    lapsed = await register(client)
    await set_user(
        sessionmaker,
        lapsed["user"]["id"],
        plan="pro",
        plan_expires_at=datetime.now(UTC) - timedelta(days=30),
    )
    async with sessionmaker() as session:
        session.add_all(
            [
                Subscription(
                    user_id=uuid.UUID(pro["user"]["id"]),
                    status="active",
                    plan="pro",
                    cycle="monthly",
                ),
                Subscription(
                    user_id=uuid.UUID(premium["user"]["id"]),
                    status="active",
                    plan="premium",
                    cycle="yearly",
                ),
            ]
        )
        await session.execute(
            update(User).where(User.id == uuid.UUID(pro["user"]["id"])).values(plan="pro")
        )
        await session.execute(
            update(User).where(User.id == uuid.UUID(premium["user"]["id"])).values(plan="premium")
        )
        await session.commit()
    await client.post(
        "/searches",
        headers=pro["headers"],
        json={"query": "bilocale Alcamo", "category": "immobili"},
    )
    await client.post(
        "/searches", headers=pro["headers"], json={"query": "cuoco Palermo", "category": "lavoro"}
    )

    body = (await client.get("/admin/analytics/overview?range=7d", headers=h)).json()
    assert body["revenue_monthly_estimate_cents"] == 299 + round(4999 / 12)
    assert body["active_subscribers"] == 2
    assert body["total_users"] == 5
    assert body["new_signups"] == 5
    assert body["plan_split"] == {"free": 3, "pro": 1, "premium": 1}
    assert body["conversion_rate"] == pytest.approx(2 / 5)
    assert body["total_searches"] == 2

    series = (
        await client.get("/admin/analytics/timeseries?range=7d&metric=signups", headers=h)
    ).json()
    assert series["bucket"] == "day"
    assert len(series["points"]) == 8  # 7 days span 8 calendar-day buckets
    assert sum(p["value"] for p in series["points"]) == 5
    assert series["points"][-1]["value"] == 5
    hourly = (
        await client.get("/admin/analytics/timeseries?range=realtime&metric=searches", headers=h)
    ).json()
    assert hourly["bucket"] == "hour" and len(hourly["points"]) == 25
    assert sum(p["value"] for p in hourly["points"]) == 2

    payload = stripe_event("evt_sub_c", "customer.subscription.created", {"id": "sub_none"})
    await client.post(
        "/billing/webhook",
        content=payload,
        headers={"Stripe-Signature": sign_stripe_payload(payload, WEBHOOK_SECRET)},
    )
    subs = (
        await client.get("/admin/analytics/timeseries?range=30d&metric=subscriptions", headers=h)
    ).json()
    assert sum(p["value"] for p in subs["points"]) == 1

    categories = (await client.get("/admin/analytics/categories?range=30d", headers=h)).json()[
        "items"
    ]
    by_cat = {i["category"]: i for i in categories}
    assert by_cat["immobili"] == {"category": "immobili", "searches": 1, "results": 2}
    assert by_cat["lavoro"]["searches"] == 1
    assert categories[0]["searches"] >= categories[-1]["searches"]


async def test_custom_range(client, sessionmaker):
    admin = await make_admin(client, sessionmaker)
    h = admin["headers"]
    today = datetime.now(UTC).date()
    start = (today - timedelta(days=10)).isoformat()
    ok = await client.get(
        f"/admin/analytics/timeseries?range=custom&from={start}&to={today.isoformat()}",
        headers=h,
    )
    assert ok.status_code == 200
    assert ok.json()["bucket"] == "day"
    assert len(ok.json()["points"]) == 11
    overview = (
        await client.get(
            f"/admin/analytics/overview?range=custom&from={start}&to={today.isoformat()}", headers=h
        )
    ).json()
    assert overview["range"]["from"].startswith(start)
    assert overview["new_signups"] == 1

    missing = await client.get("/admin/analytics/overview?range=custom", headers=h)
    assert missing.status_code == 422
    assert missing.json()["error"]["code"] == "invalid_range"
    reversed_range = await client.get(
        f"/admin/analytics/overview?range=custom&from={today}&to={start}", headers=h
    )
    assert reversed_range.status_code == 422
    unknown = await client.get("/admin/analytics/overview?range=week", headers=h)
    assert unknown.status_code == 422
    assert unknown.json()["error"]["code"] == "validation_error"


def test_resolve_range_buckets():
    now = datetime(2026, 11, 23, 12, tzinfo=UTC)
    assert resolve_range("realtime", None, None, now)[2] == "hour"
    assert resolve_range("90d", None, None, now)[2] == "week"
    assert resolve_range("365d", None, None, now)[2] == "month"
    assert resolve_range("custom", "2026-11-22", "2026-11-23", now)[2] == "hour"
    assert resolve_range("custom", "2025-01-01", "2026-11-01", now)[2] == "month"
    with pytest.raises(AppError):
        resolve_range("custom", "2020-01-01", "2026-11-01", now)
