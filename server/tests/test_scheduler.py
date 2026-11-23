from __future__ import annotations

import asyncio
import uuid
from datetime import UTC, datetime, timedelta

import httpx
import respx
from sqlalchemy import select, text

from app.categories import get_category
from app.db.models import PushToken, Result, Search
from app.services.notifier import PushNotifier
from app.services.push import ExpoPushClient, PushMessage
from app.services.scheduler import MonitorScheduler
from tests.conftest import insert_search, register, set_user
from tests.fakes import hit


def _past(minutes: int = 1) -> datetime:
    return datetime.now(UTC) - timedelta(minutes=minutes)


async def _add_token(sessionmaker, user_id: str, token: str, platform: str = "ios") -> None:
    async with sessionmaker() as session:
        session.add(
            PushToken(id=uuid.uuid4(), user_id=uuid.UUID(user_id), token=token, platform=platform)
        )
        await session.commit()


async def test_tick_runs_only_due_active_searches(container, sessionmaker, client, settings):
    user = await register(client)
    uid = user["user"]["id"]
    due = await insert_search(sessionmaker, uid, next_run_at=_past())
    future = await insert_search(
        sessionmaker, uid, next_run_at=datetime.now(UTC) + timedelta(hours=2)
    )
    inactive = await insert_search(sessionmaker, uid, is_active=False, next_run_at=_past())

    scheduler = MonitorScheduler(container.pipeline, settings)
    assert await scheduler.tick() == 1
    async with sessionmaker() as session:
        statuses = {
            s.id: s.last_run_status for s in (await session.execute(select(Search))).scalars()
        }
    assert statuses == {due: "ok", future: "pending", inactive: "pending"}
    assert await scheduler.tick() == 0  # next_run_at moved into the future


async def test_next_run_follows_plan_interval(container, sessionmaker, client, settings):
    expectations = {"free": 24, "pro": 6, "premium": 1}
    searches = {}
    for plan in expectations:
        user = await register(client)
        await set_user(sessionmaker, user["user"]["id"], plan=plan)
        searches[plan] = await insert_search(sessionmaker, user["user"]["id"], next_run_at=_past())
    await MonitorScheduler(container.pipeline, settings).tick()
    async with sessionmaker() as session:
        for plan, hours in expectations.items():
            search = await session.get(Search, searches[plan])
            delta = search.next_run_at - search.last_run_at
            assert abs(delta - timedelta(hours=hours)) < timedelta(seconds=5), plan


async def test_scheduled_run_pushes_new_results_only(
    container, sessionmaker, client, settings, fake_push, fake_provider
):
    user = await register(client, language="en")
    uid = user["user"]["id"]
    await _add_token(sessionmaker, uid, "ExponentPushToken[device-1]")
    await _add_token(sessionmaker, uid, "fcm-raw-token-not-expo", platform="android")
    other = await register(client)
    await _add_token(sessionmaker, other["user"]["id"], "ExponentPushToken[someone-else]")
    sid = await insert_search(sessionmaker, uid, next_run_at=_past(), query="flat in Alcamo")

    scheduler = MonitorScheduler(container.pipeline, settings)
    await scheduler.tick()
    assert [m.to for m in fake_push.sent] == ["ExponentPushToken[device-1]"]
    message = fake_push.sent[0]
    assert message.title == "Consulens · Real estate"
    assert message.body == "2 new results for “flat in Alcamo”"
    assert message.data == {
        "type": "new_results",
        "search_id": str(sid),
        "category": "immobili",
        "count": 2,
    }

    # Due again, but nothing new -> no push.
    async with sessionmaker() as session:
        (await session.get(Search, sid)).next_run_at = _past()
        await session.commit()
    await scheduler.tick()
    assert len(fake_push.sent) == 1

    # One new result -> push with its title.
    fake_provider.hits = [*fake_provider.hits, hit("https://casa.it/x/3", "Monolocale centro")]
    async with sessionmaker() as session:
        (await session.get(Search, sid)).next_run_at = _past()
        await session.commit()
    await scheduler.tick()
    assert len(fake_push.sent) == 2
    assert fake_push.sent[-1].body == "Monolocale centro"
    async with sessionmaker() as session:
        unseen = (
            (await session.execute(select(Result.seen).where(Result.search_id == sid)))
            .scalars()
            .all()
        )
    assert unseen == [False, False, False]


async def test_initial_and_manual_runs_do_not_push(client, sessionmaker, fake_push):
    user = await register(client)
    await _add_token(sessionmaker, user["user"]["id"], "ExponentPushToken[device-2]")
    created = await client.post(
        "/searches",
        headers=user["headers"],
        json={"query": "bilocale Alcamo", "category": "immobili"},
    )
    assert created.status_code == 201
    assert fake_push.sent == []


async def test_skip_locked_claims(container, sessionmaker, client, engine):
    user = await register(client)
    uid = user["user"]["id"]
    locked_id = await insert_search(sessionmaker, uid, next_run_at=_past(10))
    free_id = await insert_search(sessionmaker, uid, next_run_at=_past(5))

    async with engine.connect() as other_worker:
        tx = await other_worker.begin()
        await other_worker.execute(
            text("SELECT id FROM searches WHERE id = :id FOR UPDATE"), {"id": locked_id}
        )
        claimed = await asyncio.wait_for(container.pipeline.claim_due(10), timeout=5)
        assert claimed == [free_id]
        await tx.rollback()

    # Once the lock is released the remaining due search can be claimed exactly once.
    first, second = await asyncio.gather(
        container.pipeline.claim_due(10), container.pipeline.claim_due(10)
    )
    assert sorted(first + second) == [locked_id]
    async with sessionmaker() as session:
        search = await session.get(Search, locked_id)
    assert search.last_run_status == "running"
    assert search.next_run_at > datetime.now(UTC) + timedelta(minutes=9)


async def test_concurrent_ticks_never_run_a_search_twice(
    container, sessionmaker, client, settings, fake_provider
):
    user = await register(client)
    await set_user(sessionmaker, user["user"]["id"], plan="premium")
    ids = {
        await insert_search(
            sessionmaker, user["user"]["id"], next_run_at=_past(), query=f"query {i}"
        )
        for i in range(6)
    }
    worker_a = MonitorScheduler(container.pipeline, settings)
    worker_b = MonitorScheduler(container.pipeline, settings)
    ran = await asyncio.gather(worker_a.tick(), worker_b.tick())
    assert sum(ran) == len(ids)
    async with sessionmaker() as session:
        statuses = (await session.execute(select(Search.last_run_status))).scalars().all()
    assert set(statuses) == {"ok"}


@respx.mock
async def test_expo_client_and_unregistered_tokens(container, sessionmaker, client):
    user = await register(client)
    uid = user["user"]["id"]
    await _add_token(sessionmaker, uid, "ExponentPushToken[good]")
    await _add_token(sessionmaker, uid, "ExponentPushToken[gone]")
    route = respx.post("https://exp.host/--/api/v2/push/send").mock(
        return_value=httpx.Response(
            200,
            json={
                "data": [
                    {"status": "ok", "id": "ticket-1"},
                    {
                        "status": "error",
                        "message": "not registered",
                        "details": {"error": "DeviceNotRegistered"},
                    },
                ]
            },
        )
    )
    async with httpx.AsyncClient() as http:
        sender = ExpoPushClient(http, access_token="expo-token")
        notifier = PushNotifier(sessionmaker, sender)
        report = await notifier.notify_new_results(
            user_id=uuid.UUID(uid),
            search_id=uuid.uuid4(),
            category=get_category("lavoro"),
            query="cuoco Palermo",
            count=3,
            first_title=None,
            language="it",
        )
    assert report.sent == 1 and report.invalid_tokens == ["ExponentPushToken[gone]"]
    request = route.calls.last.request
    assert request.headers["Authorization"] == "Bearer expo-token"
    body = httpx.Response(200, content=request.content).json()
    assert body[0]["title"] == "Consulens · Lavoro"
    assert body[0]["body"] == "3 nuovi risultati per «cuoco Palermo»"
    async with sessionmaker() as session:
        remaining = (await session.execute(select(PushToken.token))).scalars().all()
    assert remaining == ["ExponentPushToken[good]"]


@respx.mock
async def test_expo_client_chunks_and_http_errors():
    route = respx.post("https://exp.host/--/api/v2/push/send").mock(
        side_effect=[
            httpx.Response(200, json={"data": [{"status": "ok"}] * 100}),
            httpx.Response(500, text="boom"),
        ]
    )
    async with httpx.AsyncClient() as http:
        report = await ExpoPushClient(http).send(
            [PushMessage(to=f"ExponentPushToken[{i}]", title="t", body="b") for i in range(150)]
        )
    assert route.call_count == 2
    assert report.sent == 100 and report.failed == 50
