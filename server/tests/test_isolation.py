"""User B must never see or modify user A's data (everything answers 404 / affects 0)."""

from __future__ import annotations

import uuid

from sqlalchemy import func, select

from app.db.models import PushToken, Result, Search


async def _a_with_data(client, user_a):
    created = await client.post(
        "/searches",
        headers=user_a["headers"],
        json={"query": "bilocale affitto Alcamo", "category": "immobili"},
    )
    assert created.status_code == 201
    search_id = created.json()["id"]
    results = (
        await client.get(f"/searches/{search_id}/results", headers=user_a["headers"])
    ).json()["items"]
    assert results, "the initial run should have stored results"
    await client.post(
        "/push-tokens",
        headers=user_a["headers"],
        json={"token": "ExponentPushToken[alice]", "platform": "android"},
    )
    return search_id, [r["id"] for r in results]


async def test_user_b_cannot_read_or_modify_user_a(client, sessionmaker, user_a, user_b):
    search_id, result_ids = await _a_with_data(client, user_a)
    b = user_b["headers"]

    assert (await client.get(f"/searches/{search_id}", headers=b)).status_code == 404
    assert (
        await client.patch(f"/searches/{search_id}", headers=b, json={"is_active": False})
    ).status_code == 404
    assert (await client.post(f"/searches/{search_id}/run", headers=b)).status_code == 404
    assert (await client.get(f"/searches/{search_id}/results", headers=b)).status_code == 404
    assert (await client.delete(f"/searches/{search_id}", headers=b)).status_code == 404
    assert (
        await client.patch(f"/results/{result_ids[0]}", headers=b, json={"is_favorite": True})
    ).status_code == 404
    assert (await client.delete(f"/results/{result_ids[0]}", headers=b)).status_code == 404
    mark = await client.post("/results/mark-all-seen", headers=b, json={"search_id": search_id})
    assert mark.status_code == 404

    bulk_s = await client.post(
        "/searches/bulk", headers=b, json={"ids": [search_id], "action": "delete"}
    )
    assert bulk_s.json() == {"affected": 0}
    bulk_r = await client.post(
        "/results/bulk", headers=b, json={"ids": result_ids, "action": "delete"}
    )
    assert bulk_r.json() == {"affected": 0}

    assert (await client.get("/searches", headers=b)).json() == {"items": [], "next_cursor": None}
    assert (await client.get("/results", headers=b)).json()["items"] == []
    assert (await client.get("/notifications/unseen-count", headers=b)).json() == {"count": 0}
    counts = (await client.get("/searches/counts", headers=b)).json()
    assert counts["immobili"] == {"active": 0, "unseen": 0}
    # Mark-all-seen without a search only touches B's own results.
    assert (await client.post("/results/mark-all-seen", headers=b, json={})).json() == {
        "affected": 0
    }
    # Deleting someone else's push token is a no-op.
    assert (
        await client.delete("/push-tokens/ExponentPushToken[alice]", headers=b)
    ).status_code == 204

    async with sessionmaker() as session:
        assert await session.scalar(select(func.count()).select_from(Search)) == 1
        visible = await session.scalar(
            select(func.count())
            .select_from(Result)
            .where(Result.dismissed_at.is_(None), Result.seen.is_(False))
        )
        assert visible == len(result_ids)
        assert await session.scalar(select(func.count()).select_from(PushToken)) == 1

    # A still sees everything.
    a = user_a["headers"]
    assert (await client.get(f"/searches/{search_id}", headers=a)).status_code == 200
    assert (await client.get("/notifications/unseen-count", headers=a)).json() == {
        "count": len(result_ids)
    }


async def test_malformed_and_random_ids_are_404(client, user_a):
    h = user_a["headers"]
    assert (await client.get("/searches/not-a-uuid", headers=h)).status_code == 404
    assert (await client.get(f"/searches/{uuid.uuid4()}", headers=h)).status_code == 404
    assert (
        await client.patch(f"/results/{uuid.uuid4()}", headers=h, json={"seen": True})
    ).status_code == 404


async def test_push_token_moves_between_accounts(client, sessionmaker, user_a, user_b):
    token = {"token": "ExponentPushToken[shared-device]", "platform": "ios"}
    assert (
        await client.post("/push-tokens", headers=user_a["headers"], json=token)
    ).status_code == 204
    assert (
        await client.post("/push-tokens", headers=user_b["headers"], json=token)
    ).status_code == 204
    async with sessionmaker() as session:
        rows = (await session.execute(select(PushToken))).scalars().all()
    assert len(rows) == 1
    assert str(rows[0].user_id) == user_b["user"]["id"]
