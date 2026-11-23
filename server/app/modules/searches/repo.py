from __future__ import annotations

import uuid
from collections.abc import Sequence

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Result, Search, User


async def get_owned(
    session: AsyncSession, user_id: uuid.UUID, search_id: uuid.UUID
) -> Search | None:
    return (
        await session.execute(
            select(Search).where(Search.id == search_id, Search.user_id == user_id)
        )
    ).scalar_one_or_none()


async def count_active(session: AsyncSession, user_id: uuid.UUID) -> int:
    return int(
        await session.scalar(
            select(func.count())
            .select_from(Search)
            .where(Search.user_id == user_id, Search.is_active.is_(True))
        )
        or 0
    )


async def lock_user(session: AsyncSession, user_id: uuid.UUID) -> None:
    """Serialise plan-limit checks per user (prevents concurrent creates exceeding the limit)."""
    await session.execute(select(User.id).where(User.id == user_id).with_for_update())


async def result_counts(
    session: AsyncSession, search_ids: Sequence[uuid.UUID]
) -> dict[uuid.UUID, tuple[int, int]]:
    """search_id -> (visible results, unseen visible results)."""
    if not search_ids:
        return {}
    rows = await session.execute(
        select(
            Result.search_id,
            func.count(),
            func.count().filter(Result.seen.is_(False)),
        )
        .where(Result.search_id.in_(search_ids), Result.visible())
        .group_by(Result.search_id)
    )
    return {sid: (int(total), int(unseen)) for sid, total, unseen in rows.all()}
