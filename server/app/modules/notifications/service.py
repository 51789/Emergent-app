from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import delete
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import PushToken


async def upsert_push_token(
    session: AsyncSession, user_id: uuid.UUID, token: str, platform: str
) -> None:
    """Register a device token. A token that moves to another account is re-assigned."""
    now = datetime.now(UTC)
    stmt = pg_insert(PushToken).values(
        id=uuid.uuid4(),
        user_id=user_id,
        token=token,
        platform=platform,
        created_at=now,
        updated_at=now,
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=[PushToken.token],
        set_={
            "user_id": stmt.excluded.user_id,
            "platform": stmt.excluded.platform,
            "updated_at": now,
        },
    )
    await session.execute(stmt)
    await session.commit()


async def delete_push_token(session: AsyncSession, user_id: uuid.UUID, token: str) -> None:
    await session.execute(
        delete(PushToken).where(PushToken.token == token, PushToken.user_id == user_id)
    )
    await session.commit()
