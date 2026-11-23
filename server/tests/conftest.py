"""Test fixtures: a real PostgreSQL 16 (testcontainers), Alembic migrations, fakes for externals.

Set TEST_DATABASE_URL (postgresql+asyncpg://...) to use an already running database instead of
starting a container (see docker-compose.test.yml).
"""

from __future__ import annotations

import os

# Must be set before app.main is imported (it builds the module-level app from the env).
os.environ.setdefault("JWT_SECRET", "test-only-jwt-secret-" + "x" * 40)
os.environ.setdefault("APP_ENV", "test")

import uuid  # noqa: E402
from collections.abc import AsyncIterator, Iterator  # noqa: E402
from datetime import UTC, datetime  # noqa: E402
from pathlib import Path  # noqa: E402
from typing import Any  # noqa: E402

import httpx  # noqa: E402
import pytest  # noqa: E402
from alembic.config import Config  # noqa: E402
from sqlalchemy import text, update  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncEngine  # noqa: E402

from alembic import command  # noqa: E402
from app.container import Container, build_container  # noqa: E402
from app.core.config import Settings  # noqa: E402
from app.db.models import Search, User  # noqa: E402
from app.db.session import SessionMaker, create_engine  # noqa: E402
from app.main import create_app  # noqa: E402
from tests.fakes import (  # noqa: E402
    FakeBilling,
    FakeFetcher,
    FakeGoogle,
    FakeLLM,
    FakeProvider,
    FakePush,
)

SERVER_DIR = Path(__file__).resolve().parents[1]
WEBHOOK_SECRET = "whsec_test_secret"
TABLES = "users, refresh_tokens, subscriptions, stripe_events, searches, results, push_tokens"


def alembic_config(database_url: str) -> Config:
    cfg = Config(str(SERVER_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(SERVER_DIR / "alembic"))
    cfg.attributes["database_url"] = database_url
    cfg.attributes["configure_logger"] = False
    return cfg


@pytest.fixture(scope="session")
def database_url() -> Iterator[str]:
    external = os.environ.get("TEST_DATABASE_URL")
    container = None
    if external:
        url = external
    else:
        from testcontainers.community.postgres import PostgresContainer

        container = PostgresContainer("postgres:16", driver="asyncpg")
        container.start()
        url = container.get_connection_url()
    command.upgrade(alembic_config(url), "head")
    try:
        yield url
    finally:
        if container is not None:
            container.stop()


@pytest.fixture
def settings(database_url: str) -> Settings:
    return Settings(
        _env_file=None,  # type: ignore[call-arg]
        app_env="test",
        database_url=database_url,
        database_pool_size=5,
        jwt_secret="unit-test-jwt-secret-" + "y" * 40,
        bcrypt_rounds=4,
        google_client_ids="test-client.apps.googleusercontent.com",
        anthropic_api_key=None,
        serper_api_key=None,
        stripe_secret_key="sk_test_dummy",
        stripe_webhook_secret=WEBHOOK_SECRET,
        stripe_price_pro_monthly="price_pro_monthly",
        stripe_price_pro_yearly="price_pro_yearly",
        stripe_price_premium_monthly="price_premium_monthly",
        stripe_price_premium_yearly="price_premium_yearly",
        run_scheduler_in_process=False,
    )


@pytest.fixture
async def engine(settings: Settings) -> AsyncIterator[AsyncEngine]:
    eng = create_engine(settings)
    async with eng.begin() as conn:
        await conn.execute(text(f"TRUNCATE {TABLES} RESTART IDENTITY CASCADE"))
    yield eng
    await eng.dispose()


@pytest.fixture
def fake_provider() -> FakeProvider:
    return FakeProvider()


@pytest.fixture
def fake_llm() -> FakeLLM:
    return FakeLLM()


@pytest.fixture
def fake_push() -> FakePush:
    return FakePush()


@pytest.fixture
def fake_google() -> FakeGoogle:
    return FakeGoogle()


@pytest.fixture
def fake_fetcher() -> FakeFetcher:
    return FakeFetcher()


@pytest.fixture
def fake_billing() -> FakeBilling:
    return FakeBilling(WEBHOOK_SECRET)


@pytest.fixture
async def container(
    settings: Settings,
    engine: AsyncEngine,
    fake_llm: FakeLLM,
    fake_provider: FakeProvider,
    fake_push: FakePush,
    fake_google: FakeGoogle,
    fake_billing: FakeBilling,
    fake_fetcher: FakeFetcher,
) -> AsyncIterator[Container]:
    c = build_container(
        settings,
        engine=engine,
        llm=fake_llm,
        search_provider=fake_provider,
        push_sender=fake_push,
        google_verifier=fake_google,
        billing=fake_billing,
        verify_llm=fake_llm,
        page_fetcher=fake_fetcher,
    )
    yield c
    await c.http.aclose()


@pytest.fixture
def sessionmaker(container: Container) -> SessionMaker:
    return container.sessionmaker


@pytest.fixture
async def client(container: Container) -> AsyncIterator[httpx.AsyncClient]:
    app = create_app(container=container)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test/api/v1") as c:
        yield c


# --------------------------------------------------------------------------- helpers


def bearer(auth: dict[str, Any]) -> dict[str, str]:
    return {"Authorization": f"Bearer {auth['access_token']}"}


async def register(
    client: httpx.AsyncClient, email: str | None = None, password: str = "password123", **extra: Any
) -> dict[str, Any]:
    email = email or f"user-{uuid.uuid4().hex[:8]}@consulens-test.com"
    response = await client.post(
        "/auth/register", json={"email": email, "password": password, **extra}
    )
    assert response.status_code == 201, response.text
    data = response.json()
    data["headers"] = bearer(data)
    return data


async def set_user(sessionmaker: SessionMaker, user_id: str, **values: Any) -> None:
    async with sessionmaker() as session:
        await session.execute(update(User).where(User.id == uuid.UUID(user_id)).values(**values))
        await session.commit()


async def make_admin(client: httpx.AsyncClient, sessionmaker: SessionMaker) -> dict[str, Any]:
    admin = await register(client)
    await set_user(sessionmaker, admin["user"]["id"], role="admin")
    return admin


async def insert_search(sessionmaker: SessionMaker, user_id: str, **values: Any) -> uuid.UUID:
    search = Search(
        id=uuid.uuid4(),
        user_id=uuid.UUID(user_id),
        query=values.pop("query", "bilocale in affitto ad Alcamo max 500 euro"),
        category=values.pop("category", "immobili"),
        language=values.pop("language", "it"),
        next_run_at=values.pop("next_run_at", datetime.now(UTC)),
        **values,
    )
    async with sessionmaker() as session:
        session.add(search)
        await session.commit()
    return search.id


@pytest.fixture
async def user_a(client: httpx.AsyncClient) -> dict[str, Any]:
    return await register(client, "alice@consulens-test.com")


@pytest.fixture
async def user_b(client: httpx.AsyncClient) -> dict[str, Any]:
    return await register(client, "bob@consulens-test.com")
