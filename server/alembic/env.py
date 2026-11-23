"""Alembic environment (async, asyncpg).

The URL comes from `config.attributes["database_url"]` (set programmatically, e.g. by the
test suite), the DATABASE_URL environment variable, or DATABASE_URL in the same .env files
the app reads (repo root, then server/). It deliberately does not load the full application
Settings, so migrations don't require JWT/Stripe/etc. secrets.
"""

from __future__ import annotations

import asyncio
import os
from logging.config import fileConfig

from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import create_async_engine

from alembic import context
from app.core.config import ENV_FILES
from app.db import models  # noqa: F401  (registers tables on the metadata)
from app.db.base import Base

config = context.config

if config.config_file_name is not None and config.attributes.get("configure_logger", True):
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata


class _DatabaseOnly(BaseSettings):
    """Reads only DATABASE_URL, from the environment or the same .env files as the app."""

    model_config = SettingsConfigDict(env_file=ENV_FILES, env_file_encoding="utf-8", extra="ignore")
    database_url: str | None = None


def _database_url() -> str:
    url = (
        config.attributes.get("database_url")
        or os.environ.get("DATABASE_URL")
        or _DatabaseOnly().database_url
    )
    if not url:
        raise RuntimeError("DATABASE_URL is not set (environment or .env)")
    return url


def run_migrations_offline() -> None:
    context.configure(
        url=_database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def _run_sync(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    engine = create_async_engine(_database_url(), poolclass=pool.NullPool)
    async with engine.connect() as connection:
        await connection.run_sync(_run_sync)
    await engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
