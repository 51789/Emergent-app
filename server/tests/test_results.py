from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import update

from app.db.models import Result, Search
from tests.conftest import insert_search
from tests.fakes import hit

RESULT_KEYS = {
    "id",
    "search_id",
    "category",
    "title",
    "summary",
    "url",
    "source_domain",
    "image_url",
    "price",
    "location",
    "seller_type",
    "status",
    "posted_date",
    "expiry_date",
    "contacts",
    "is_favorite",
    "seen",
    "found_at",
    "verified",
    "verified_at",
    "source_trust",
}


async def _insert_result(sessionmaker, search_id, user_id, **values):
    now = datetime.now(UTC)
    url = values.pop("url", f"https://example.it/{uuid.uuid4().hex}")
    result = Result(
        id=uuid.uuid4(),
        search_id=search_id,
        user_id=uuid.UUID(user_id),
        category=values.pop("category", "immobili"),
        title=values.pop("title", "Annuncio"),
        summary="",
        url=url,
        url_hash=uuid.uuid4().hex,
        source_domain="example.it",
        found_at=values.pop("found_at", now),
        verified=values.pop("verified", True),
        **values,
    )
    async with sessionmaker() as session:
        session.add(result)
        await session.commit()
    return str(result.id)


async def test_search_results_sorted_posted_desc_nulls_last(client, sessionmaker, user_a):
    uid = user_a["user"]["id"]
    sid = await insert_search(sessionmaker, uid, next_run_at=None)
    now = datetime.now(UTC)
    r_old = await _insert_result(sessionmaker, sid, uid, posted_date=date(2026, 1, 5), found_at=now)
    r_new = await _insert_result(
        sessionmaker, sid, uid, posted_date=date(2026, 11, 1), found_at=now - timedelta(days=3)
    )
    r_null_recent = await _insert_result(sessionmaker, sid, uid, found_at=now)
    r_null_old = await _insert_result(sessionmaker, sid, uid, found_at=now - timedelta(days=1))
    r_same_day = await _insert_result(
        sessionmaker, sid, uid, posted_date=date(2026, 11, 1), found_at=now
    )
    expected = [r_same_day, r_new, r_old, r_null_recent, r_null_old]

    h = user_a["headers"]
    full = (await client.get(f"/searches/{sid}/results", headers=h)).json()
    assert [r["id"] for r in full["items"]] == expected
    assert set(full["items"][0]) == RESULT_KEYS
    assert full["items"][0]["posted_date"] == "2026-11-01"

    collected, cursor = [], None
    while True:
        url = f"/searches/{sid}/results?limit=2" + (f"&cursor={cursor}" if cursor else "")
        page = (await client.get(url, headers=h)).json()
        collected += [r["id"] for r in page["items"]]
        cursor = page["next_cursor"]
        if not cursor:
            break
    assert collected == expected


async def test_status_becomes_scaduto_after_deadline(client, sessionmaker, user_a):
    uid = user_a["user"]["id"]
    sid = await insert_search(sessionmaker, uid, category="bandi", next_run_at=None)
    await _insert_result(
        sessionmaker,
        sid,
        uid,
        category="bandi",
        status="ATTIVO",
        expiry_date=datetime.now(UTC).date() - timedelta(days=1),
    )
    items = (await client.get(f"/searches/{sid}/results", headers=user_a["headers"])).json()[
        "items"
    ]
    assert items[0]["status"] == "SCADUTO"


async def test_favorite_seen_and_feed_filters(client, sessionmaker, user_a):
    h = user_a["headers"]
    search = (
        await client.post(
            "/searches", headers=h, json={"query": "bilocale Alcamo", "category": "immobili"}
        )
    ).json()
    items = (await client.get(f"/searches/{search['id']}/results", headers=h)).json()["items"]
    first, second = items[0]["id"], items[1]["id"]

    fav = await client.patch(f"/results/{first}", headers=h, json={"is_favorite": True})
    assert fav.status_code == 200 and fav.json()["is_favorite"] is True
    seen = await client.patch(f"/results/{second}", headers=h, json={"seen": True})
    assert seen.json()["seen"] is True
    assert (
        await client.patch(f"/results/{first}", headers=h, json={"title": "x"})
    ).status_code == 422

    favorites = (await client.get("/results?favorite=true", headers=h)).json()["items"]
    assert [r["id"] for r in favorites] == [first]
    unseen = (await client.get("/results?unseen=true", headers=h)).json()["items"]
    assert [r["id"] for r in unseen] == [first]
    assert (await client.get("/results?category=lavoro", headers=h)).json()["items"] == []
    assert len((await client.get("/results?category=immobili", headers=h)).json()["items"]) == 2
    assert (await client.get("/notifications/unseen-count", headers=h)).json() == {"count": 1}


async def test_delete_hides_result_and_it_is_not_re_added(client, user_a, sessionmaker):
    h = user_a["headers"]
    search = (
        await client.post(
            "/searches", headers=h, json={"query": "bilocale Alcamo", "category": "immobili"}
        )
    ).json()
    items = (await client.get(f"/searches/{search['id']}/results", headers=h)).json()["items"]
    target = items[0]["id"]
    assert (await client.delete(f"/results/{target}", headers=h)).status_code == 204
    assert (await client.delete(f"/results/{target}", headers=h)).status_code == 404

    # Re-running finds the same URLs: the deleted result does not come back.
    async with sessionmaker() as session:
        await session.execute(
            update(Search)
            .where(Search.id == uuid.UUID(search["id"]))
            .values(last_run_started_at=datetime.now(UTC) - timedelta(hours=1))
        )
        await session.commit()
    assert (await client.post(f"/searches/{search['id']}/run", headers=h)).status_code == 202
    remaining = (await client.get(f"/searches/{search['id']}/results", headers=h)).json()["items"]
    assert [r["id"] for r in remaining] == [items[1]["id"]]


async def test_bulk_and_mark_all_seen(client, user_a, fake_provider):
    h = user_a["headers"]
    s1 = (
        await client.post(
            "/searches", headers=h, json={"query": "bilocale Alcamo", "category": "immobili"}
        )
    ).json()
    fake_provider.hits = [
        hit("https://www.infojobs.it/offerta/1", "Cuoco a Palermo"),
        hit("https://www.indeed.com/viewjob?jk=2", "Cameriere a Palermo"),
    ]
    s2 = (
        await client.post(
            "/searches", headers=h, json={"query": "lavoro cuoco Palermo", "category": "lavoro"}
        )
    ).json()
    r1 = [
        r["id"]
        for r in (await client.get(f"/searches/{s1['id']}/results", headers=h)).json()["items"]
    ]

    fav = await client.post("/results/bulk", headers=h, json={"ids": r1, "action": "favorite"})
    assert fav.json() == {"affected": 2}
    fav_again = await client.post(
        "/results/bulk", headers=h, json={"ids": r1, "action": "favorite"}
    )
    assert fav_again.json() == {"affected": 0}
    unfav = await client.post(
        "/results/bulk", headers=h, json={"ids": r1[:1], "action": "unfavorite"}
    )
    assert unfav.json() == {"affected": 1}

    marked = await client.post("/results/mark-all-seen", headers=h, json={"search_id": s1["id"]})
    assert marked.json() == {"affected": 2}
    assert (await client.get("/notifications/unseen-count", headers=h)).json() == {"count": 2}
    rest = await client.post("/results/mark-all-seen", headers=h, json={})
    assert rest.json() == {"affected": 2}
    assert (await client.get("/notifications/unseen-count", headers=h)).json() == {"count": 0}

    deleted = await client.post("/results/bulk", headers=h, json={"ids": r1, "action": "delete"})
    assert deleted.json() == {"affected": 2}
    assert (await client.get(f"/searches/{s1['id']}", headers=h)).json()["results_count"] == 0
    assert (await client.get(f"/searches/{s2['id']}", headers=h)).json()["results_count"] == 2


async def test_feed_pagination(client, sessionmaker, user_a):
    uid = user_a["user"]["id"]
    sid = await insert_search(sessionmaker, uid, next_run_at=None)
    now = datetime.now(UTC)
    ids = [
        await _insert_result(sessionmaker, sid, uid, found_at=now - timedelta(minutes=i))
        for i in range(5)
    ]
    h = user_a["headers"]
    page1 = (await client.get("/results?limit=3", headers=h)).json()
    page2 = (await client.get(f"/results?limit=3&cursor={page1['next_cursor']}", headers=h)).json()
    assert [r["id"] for r in page1["items"] + page2["items"]] == ids
    assert page2["next_cursor"] is None
