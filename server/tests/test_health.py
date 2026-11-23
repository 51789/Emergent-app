from __future__ import annotations

import pytest
from pydantic import ValidationError
from sqlalchemy import func, select

from alembic import command
from app.core.config import Settings
from app.db.models import User
from app.main import create_app
from tests.conftest import alembic_config


async def test_health_reports_configuration(client):
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "llm_configured": True,
        "llm_provider": "fake",
        "search_provider_configured": True,
        "stripe_configured": True,
    }


async def test_health_without_providers(settings, engine):
    from app.container import build_container

    container = build_container(
        settings,
        engine=engine,
        llm=None,
        search_provider=None,
        billing=None,
        google_verifier=None,
    )
    import httpx

    app = create_app(container=container)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test/api/v1"
    ) as c:
        body = (await c.get("/health")).json()
    await container.http.aclose()
    assert body == {
        "status": "ok",
        "llm_configured": False,
        "llm_provider": None,
        "search_provider_configured": False,
        "stripe_configured": False,
    }


async def test_unknown_route_uses_error_envelope(client):
    response = await client.get("/does-not-exist")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


def test_jwt_secret_is_required(monkeypatch):
    monkeypatch.delenv("JWT_SECRET", raising=False)
    with pytest.raises(ValidationError):
        Settings(_env_file=None)  # type: ignore[call-arg]


def test_jwt_secret_must_be_long(monkeypatch):
    with pytest.raises(ValidationError):
        Settings(_env_file=None, jwt_secret="short")  # type: ignore[call-arg]


def test_migrations_match_models(database_url):
    """Fails if the ORM models drifted from the committed Alembic migrations."""
    command.check(alembic_config(database_url))


async def test_lifespan_bootstraps_admin_once(settings, container):
    settings.bootstrap_admin_email = "Owner@Consulens-Test.com"
    settings.bootstrap_admin_password = "a-very-strong-password"
    app = create_app(container=container)
    for _ in range(2):
        async with app.router.lifespan_context(app):
            pass
    async with container.sessionmaker() as session:
        admins = (await session.execute(select(User).where(User.role == "admin"))).scalars().all()
        total = await session.scalar(select(func.count()).select_from(User))
    assert [a.email for a in admins] == ["owner@consulens-test.com"]
    assert total == 1


async def test_bootstrap_skipped_when_admin_exists(settings, container, client):
    from tests.conftest import make_admin

    await make_admin(client, container.sessionmaker)
    settings.bootstrap_admin_email = "second@consulens-test.com"
    settings.bootstrap_admin_password = "a-very-strong-password"
    app = create_app(container=container)
    async with app.router.lifespan_context(app):
        pass
    async with container.sessionmaker() as session:
        count = await session.scalar(
            select(func.count()).select_from(User).where(User.role == "admin")
        )
        second = await session.scalar(select(User).where(User.email == "second@consulens-test.com"))
    assert count == 1
    assert second is None
