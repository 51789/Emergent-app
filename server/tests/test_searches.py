from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select, update

from app.categories import CATEGORY_IDS
from app.db.models import Result, Search
from tests.conftest import register, set_user

SEARCH_KEYS = {
    "id",
    "query",
    "category",
    "language",
    "is_active",
    "filters",
    "keywords",
    "summary",
    "created_at",
    "last_run_at",
    "last_run_status",
    "last_error",
    "next_run_at",
    "results_count",
    "unseen_count",
}


async def _create(client, headers, query="bilocale affitto Alcamo", category="immobili", **kw):
    return await client.post(
        "/searches", headers=headers, json={"query": query, "category": category, **kw}
    )


async def test_create_search_returns_pending_then_runs(client, user_a, fake_llm, fake_provider):
    response = await _create(client, user_a["headers"])
    assert response.status_code == 201
    body = response.json()
    assert set(body) == SEARCH_KEYS
    assert body["last_run_status"] == "pending"
    assert body["language"] == "it"  # defaults to the user's language
    assert body["results_count"] == 0

    # The first run executed in the background (synchronously under the test transport).
    fetched = (await client.get(f"/searches/{body['id']}", headers=user_a["headers"])).json()
    assert fetched["last_run_status"] == "ok"
    assert fetched["last_error"] is None
    assert fetched["results_count"] == 2
    assert fetched["unseen_count"] == 2
    assert fetched["summary"] == "Bilocali in affitto ad Alcamo"
    assert fetched["filters"] == {"location": "Alcamo", "max_price": "500"}
    assert fetched["keywords"] == ["bilocale", "affitto", "alcamo"]
    next_run = datetime.fromisoformat(fetched["next_run_at"])
    assert timedelta(hours=23) < next_run - datetime.now(UTC) <= timedelta(hours=24)
    assert fake_llm.plan_calls == 1
    assert [c["query"] for c in fake_provider.calls] == fake_llm.plan.web_queries
    assert {c["country"] for c in fake_provider.calls} == {"it"}


async def test_create_validation(client, user_a):
    assert (await _create(client, user_a["headers"], category="nope")).status_code == 422
    assert (await _create(client, user_a["headers"], query="  ")).status_code == 422
    assert (await _create(client, user_a["headers"], language="xx")).status_code == 422
    english = await _create(client, user_a["headers"], language="en")
    assert english.json()["language"] == "en"


async def test_free_plan_limit(client, sessionmaker, user_a):
    h = user_a["headers"]
    ids = [(await _create(client, h, query=f"ricerca numero {i}")).json()["id"] for i in range(3)]
    over = await _create(client, h, query="quarta ricerca")
    assert over.status_code == 402
    assert over.json()["error"]["code"] == "plan_limit_reached"

    # Deactivating frees a slot; re-activating beyond the limit is refused.
    off = await client.patch(f"/searches/{ids[0]}", headers=h, json={"is_active": False})
    assert off.status_code == 200
    assert off.json()["is_active"] is False
    assert off.json()["next_run_at"] is None
    assert (await _create(client, h, query="quarta ricerca")).status_code == 201
    back_on = await client.patch(f"/searches/{ids[0]}", headers=h, json={"is_active": True})
    assert back_on.status_code == 402
    bulk_on = await client.post(
        "/searches/bulk", headers=h, json={"ids": [ids[0]], "action": "activate"}
    )
    assert bulk_on.status_code == 402

    # Upgrading the plan raises the limit.
    await set_user(sessionmaker, user_a["user"]["id"], plan="pro")
    back_on = await client.patch(f"/searches/{ids[0]}", headers=h, json={"is_active": True})
    assert back_on.status_code == 200
    assert back_on.json()["is_active"] is True


async def test_expired_paid_plan_falls_back_to_free_limits(client, sessionmaker, user_a):
    await set_user(
        sessionmaker,
        user_a["user"]["id"],
        plan="pro",
        plan_expires_at=datetime.now(UTC) - timedelta(days=10),
    )
    me = (await client.get("/me", headers=user_a["headers"])).json()
    assert me["plan"] == "free"
    for i in range(3):
        assert (await _create(client, user_a["headers"], query=f"query {i} abc")).status_code == 201
    assert (await _create(client, user_a["headers"], query="one more")).status_code == 402


async def test_counts_cover_all_categories(client, user_a):
    await _create(client, user_a["headers"])
    await _create(client, user_a["headers"], query="concorso infermiere Sicilia", category="bandi")
    counts = (await client.get("/searches/counts", headers=user_a["headers"])).json()
    assert set(counts) == set(CATEGORY_IDS)
    assert counts["immobili"] == {"active": 1, "unseen": 2}
    assert counts["bandi"] == {"active": 1, "unseen": 2}
    assert counts["lavoro"] == {"active": 0, "unseen": 0}


async def test_list_filters_and_pagination(client, sessionmaker, user_a):
    await set_user(sessionmaker, user_a["user"]["id"], plan="premium")
    h = user_a["headers"]
    created = []
    for i in range(5):
        category = "lavoro" if i % 2 else "immobili"
        created.append(
            (await _create(client, h, query=f"ricerca {i} test", category=category)).json()["id"]
        )
    await client.patch(f"/searches/{created[0]}", headers=h, json={"is_active": False})

    page1 = (await client.get("/searches?limit=2", headers=h)).json()
    assert len(page1["items"]) == 2 and page1["next_cursor"]
    page2 = (await client.get(f"/searches?limit=2&cursor={page1['next_cursor']}", headers=h)).json()
    page3 = (await client.get(f"/searches?limit=2&cursor={page2['next_cursor']}", headers=h)).json()
    assert page3["next_cursor"] is None
    seen = [s["id"] for p in (page1, page2, page3) for s in p["items"]]
    assert seen == list(reversed(created))  # newest first, no gaps or duplicates

    lavoro = (await client.get("/searches?category=lavoro", headers=h)).json()["items"]
    assert {s["category"] for s in lavoro} == {"lavoro"} and len(lavoro) == 2
    inactive = (await client.get("/searches?is_active=false", headers=h)).json()["items"]
    assert [s["id"] for s in inactive] == [created[0]]

    bad = await client.get("/searches?cursor=garbage!!", headers=h)
    assert bad.status_code == 400
    assert bad.json()["error"]["code"] == "invalid_cursor"
    # limit is clamped to 100
    assert (await client.get("/searches?limit=1000", headers=h)).status_code == 200


async def test_manual_run_rate_limit(client, sessionmaker, user_a, fake_provider):
    h = user_a["headers"]
    search_id = (await _create(client, h)).json()["id"]
    limited = await client.post(f"/searches/{search_id}/run", headers=h)
    assert limited.status_code == 429
    assert limited.json()["error"]["code"] == "rate_limited"
    assert int(limited.headers["Retry-After"]) > 0

    async with sessionmaker() as session:
        await session.execute(
            update(Search)
            .where(Search.id == uuid.UUID(search_id))
            .values(last_run_started_at=datetime.now(UTC) - timedelta(minutes=6))
        )
        await session.commit()
    calls_before = len(fake_provider.calls)
    accepted = await client.post(f"/searches/{search_id}/run", headers=h)
    assert accepted.status_code == 202
    assert accepted.json()["last_run_status"] == "pending"
    assert len(fake_provider.calls) > calls_before  # the run happened
    after = (await client.get(f"/searches/{search_id}", headers=h)).json()
    assert after["last_run_status"] == "ok"


async def test_delete_cascades_results(client, sessionmaker, user_a):
    h = user_a["headers"]
    search_id = (await _create(client, h)).json()["id"]
    assert (await client.delete(f"/searches/{search_id}", headers=h)).status_code == 204
    assert (await client.get(f"/searches/{search_id}", headers=h)).status_code == 404
    async with sessionmaker() as session:
        assert await session.scalar(select(func.count()).select_from(Result)) == 0


async def test_bulk_actions(client, sessionmaker, user_a):
    h = user_a["headers"]
    ids = [(await _create(client, h, query=f"ricerca {i} bulk")).json()["id"] for i in range(3)]
    deactivate = await client.post(
        "/searches/bulk", headers=h, json={"ids": ids[:2] + ["junk"], "action": "deactivate"}
    )
    assert deactivate.json() == {"affected": 2}
    again = await client.post(
        "/searches/bulk", headers=h, json={"ids": ids[:2], "action": "deactivate"}
    )
    assert again.json() == {"affected": 0}
    activate = await client.post(
        "/searches/bulk", headers=h, json={"ids": ids[:1], "action": "activate"}
    )
    assert activate.json() == {"affected": 1}
    delete = await client.post("/searches/bulk", headers=h, json={"ids": ids, "action": "delete"})
    assert delete.json() == {"affected": 3}
    assert (await client.get("/searches", headers=h)).json()["items"] == []


async def test_other_users_limit_is_independent(client, user_a):
    other = await register(client)
    for i in range(3):
        assert (await _create(client, user_a["headers"], query=f"a {i} query")).status_code == 201
    assert (await _create(client, other["headers"], query="b query")).status_code == 201
