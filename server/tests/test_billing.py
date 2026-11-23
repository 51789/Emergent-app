from __future__ import annotations

import time
import uuid

from sqlalchemy import func, select

from app.db.models import StripeEvent, Subscription
from tests.conftest import WEBHOOK_SECRET, register
from tests.fakes import sign_stripe_payload, stripe_event

PERIOD_END = int(time.time()) + 30 * 24 * 3600


def _subscription(
    sub_id,
    user_id,
    *,
    status="active",
    price="price_pro_monthly",
    period_end=PERIOD_END,
    legacy_period=False,
    cancel=False,
):
    item = {"id": "si_1", "price": {"id": price}}
    sub = {
        "id": sub_id,
        "object": "subscription",
        "customer": "cus_test_1",
        "status": status,
        "cancel_at_period_end": cancel,
        "metadata": {"user_id": user_id},
        "items": {"object": "list", "data": [item]},
    }
    if legacy_period:
        sub["current_period_end"] = period_end
    else:
        item["current_period_end"] = period_end  # API >= 2025-03-31 shape
    return sub


async def _post_event(client, payload: bytes, secret: str = WEBHOOK_SECRET):
    return await client.post(
        "/billing/webhook",
        content=payload,
        headers={
            "Stripe-Signature": sign_stripe_payload(payload, secret),
            "Content-Type": "application/json",
        },
    )


async def test_plans_public(client):
    response = await client.get("/billing/plans")
    assert response.status_code == 200
    plans = {p["id"]: p for p in response.json()}
    assert list(plans) == ["free", "pro", "premium"]
    assert plans["free"]["prices"] == {"monthly": None, "yearly": None}
    assert plans["pro"]["prices"] == {
        "monthly": {"amount_cents": 299, "currency": "eur"},
        "yearly": {"amount_cents": 2999, "currency": "eur"},
    }
    assert plans["premium"]["prices"]["monthly"]["amount_cents"] == 499
    assert plans["premium"]["prices"]["yearly"]["amount_cents"] == 4999
    assert [(p["max_active_searches"], p["refresh_interval_hours"]) for p in plans.values()] == [
        (3, 24),
        (15, 6),
        (100, 1),
    ]
    assert all(p["features"] for p in plans.values())
    english = (await client.get("/billing/plans?language=en")).json()
    assert english[0]["features"][0] == "Up to 3 active searches"


async def test_billing_me_default(client, user_a):
    response = await client.get("/billing/me", headers=user_a["headers"])
    assert response.json() == {
        "plan": "free",
        "cycle": None,
        "status": "none",
        "current_period_end": None,
        "cancel_at_period_end": False,
    }


async def test_checkout_creates_subscription_session(client, user_a, fake_billing, sessionmaker):
    body = {
        "plan": "pro",
        "cycle": "yearly",
        "success_url": "consulens://billing/success",
        "cancel_url": "https://consulens.app/billing/cancel",
    }
    response = await client.post("/billing/checkout", headers=user_a["headers"], json=body)
    assert response.status_code == 200
    assert response.json() == {"url": "https://checkout.stripe.test/c/1"}
    checkout = fake_billing.checkouts[0]
    assert checkout["price_id"] == "price_pro_yearly"
    assert checkout["customer_id"] == "cus_test_1"
    assert checkout["user_id"] == user_a["user"]["id"]

    # The customer is reused on the next checkout.
    await client.post("/billing/checkout", headers=user_a["headers"], json=body)
    assert len(fake_billing.customers) == 1
    async with sessionmaker() as session:
        row = await session.get(Subscription, uuid.UUID(user_a["user"]["id"]))
    assert row.stripe_customer_id == "cus_test_1"

    bad = await client.post(
        "/billing/checkout", headers=user_a["headers"], json={**body, "success_url": "not a url"}
    )
    assert bad.status_code == 422


async def test_portal_requires_billing_account(client, user_a, fake_billing):
    body = {"return_url": "consulens://settings"}
    missing = await client.post("/billing/portal", headers=user_a["headers"], json=body)
    assert missing.status_code == 409
    assert missing.json()["error"]["code"] == "no_billing_account"
    await client.post(
        "/billing/checkout",
        headers=user_a["headers"],
        json={
            "plan": "pro",
            "cycle": "monthly",
            "success_url": "https://a.app/ok",
            "cancel_url": "https://a.app/no",
        },
    )
    ok = await client.post("/billing/portal", headers=user_a["headers"], json=body)
    assert ok.json() == {"url": "https://billing.stripe.test/portal"}
    assert fake_billing.portals == [
        {"customer_id": "cus_test_1", "return_url": "consulens://settings"}
    ]


async def test_webhook_rejects_bad_signature(client):
    payload = stripe_event("evt_bad", "customer.subscription.updated", {"id": "sub_x"})
    response = await _post_event(client, payload, secret="whsec_wrong")
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_signature"
    unsigned = await client.post("/billing/webhook", content=payload)
    assert unsigned.status_code == 400


async def test_checkout_completed_activates_plan(client, user_a, fake_billing, sessionmaker):
    uid = user_a["user"]["id"]
    fake_billing.subscriptions["sub_1"] = _subscription("sub_1", uid)
    payload = stripe_event(
        "evt_1",
        "checkout.session.completed",
        {
            "id": "cs_1",
            "object": "checkout.session",
            "mode": "subscription",
            "subscription": "sub_1",
            "customer": "cus_test_1",
            "client_reference_id": uid,
        },
    )
    response = await _post_event(client, payload)
    assert response.status_code == 200
    assert response.json() == {"received": True}

    me = (await client.get("/me", headers=user_a["headers"])).json()
    assert me["plan"] == "pro"
    assert me["plan_expires_at"] is not None
    billing = (await client.get("/billing/me", headers=user_a["headers"])).json()
    assert billing["plan"] == "pro"
    assert billing["status"] == "active"
    assert billing["cycle"] == "monthly"
    assert billing["cancel_at_period_end"] is False
    assert billing["current_period_end"] is not None

    # Same event delivered again: processed once.
    assert (await _post_event(client, payload)).status_code == 200
    assert fake_billing.retrieved == ["sub_1"]
    async with sessionmaker() as session:
        event = await session.get(StripeEvent, "evt_1")
    assert str(event.user_id) == uid

    # Already subscribed -> checkout refused, portal instead.
    again = await client.post(
        "/billing/checkout",
        headers=user_a["headers"],
        json={
            "plan": "premium",
            "cycle": "monthly",
            "success_url": "https://a.app/ok",
            "cancel_url": "https://a.app/no",
        },
    )
    assert again.status_code == 409
    assert again.json()["error"]["code"] == "already_subscribed"


async def test_subscription_lifecycle(client, user_a, fake_billing, sessionmaker):
    uid = user_a["user"]["id"]
    fake_billing.subscriptions["sub_2"] = _subscription(
        "sub_2", uid, price="price_premium_yearly", legacy_period=True
    )
    await _post_event(
        client,
        stripe_event(
            "evt_c", "customer.subscription.created", {"id": "sub_2", "object": "subscription"}
        ),
    )
    me = (await client.get("/billing/me", headers=user_a["headers"])).json()
    assert (me["plan"], me["cycle"], me["status"]) == ("premium", "yearly", "active")

    fake_billing.subscriptions["sub_2"] = _subscription(
        "sub_2", uid, status="past_due", price="price_premium_yearly", cancel=True
    )
    await _post_event(
        client,
        stripe_event(
            "evt_f",
            "invoice.payment_failed",
            {
                "id": "in_1",
                "object": "invoice",
                "parent": {"subscription_details": {"subscription": "sub_2"}},
            },
        ),
    )
    me = (await client.get("/billing/me", headers=user_a["headers"])).json()
    assert (me["plan"], me["status"], me["cancel_at_period_end"]) == ("premium", "past_due", True)

    fake_billing.subscriptions["sub_2"] = _subscription(
        "sub_2", uid, status="canceled", price="price_premium_yearly"
    )
    await _post_event(
        client,
        stripe_event(
            "evt_d", "customer.subscription.deleted", {"id": "sub_2", "object": "subscription"}
        ),
    )
    me = (await client.get("/billing/me", headers=user_a["headers"])).json()
    assert (me["plan"], me["status"]) == ("free", "canceled")
    assert (await client.get("/me", headers=user_a["headers"])).json()["plan"] == "free"
    async with sessionmaker() as session:
        assert await session.scalar(select(func.count()).select_from(StripeEvent)) == 3


async def test_unknown_customer_is_recorded_but_ignored(client, fake_billing, sessionmaker):
    fake_billing.subscriptions["sub_9"] = {
        **_subscription("sub_9", str(uuid.uuid4())),
        "customer": "cus_unknown",
    }
    response = await _post_event(
        client, stripe_event("evt_9", "customer.subscription.updated", {"id": "sub_9"})
    )
    assert response.status_code == 200
    async with sessionmaker() as session:
        event = await session.get(StripeEvent, "evt_9")
    assert event is not None and event.user_id is None


async def test_deleting_account_cancels_subscription(client, fake_billing):
    user = await register(client)
    uid = user["user"]["id"]
    fake_billing.subscriptions["sub_del"] = _subscription("sub_del", uid)
    await _post_event(
        client, stripe_event("evt_del", "customer.subscription.created", {"id": "sub_del"})
    )
    assert (await client.delete("/me", headers=user["headers"])).status_code == 204
    assert fake_billing.cancelled == ["sub_del"]


async def test_billing_not_configured(settings, engine, user_a):
    import httpx

    from app.container import build_container
    from app.main import create_app

    container = build_container(
        settings, engine=engine, billing=None, llm=None, search_provider=None, google_verifier=None
    )
    app = create_app(container=container)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test/api/v1"
    ) as c:
        response = await c.post(
            "/billing/checkout",
            headers=user_a["headers"],
            json={
                "plan": "pro",
                "cycle": "monthly",
                "success_url": "https://a.app/ok",
                "cancel_url": "https://a.app/no",
            },
        )
        webhook = await c.post("/billing/webhook", content=b"{}")
    await container.http.aclose()
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "billing_not_configured"
    assert webhook.status_code == 503


async def test_stripe_outage_maps_to_502(client, user_a, fake_billing):
    import stripe

    async def boom(**kwargs):
        raise stripe.APIConnectionError("network down")

    fake_billing.create_checkout_session = boom  # type: ignore[method-assign]
    response = await client.post(
        "/billing/checkout",
        headers=user_a["headers"],
        json={
            "plan": "pro",
            "cycle": "monthly",
            "success_url": "https://a.app/ok",
            "cancel_url": "https://a.app/no",
        },
    )
    assert response.status_code == 502
    assert response.json()["error"]["code"] == "billing_provider_error"
