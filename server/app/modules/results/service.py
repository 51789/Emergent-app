from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

from sqlalchemy import Boolean, ColumnElement, Date, func, literal, select, tuple_, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import not_found
from app.core.ids import parse_ids
from app.core.pagination import (
    Page,
    decode_cursor,
    encode_cursor,
    parse_date,
    parse_datetime,
    parse_uuid,
)
from app.db.models import Result, User
from app.modules.results.schemas import ResultOut, result_out

# Sort: verified first, then posted_date DESC (missing dates last), then found_at DESC, id DESC.
_MIN_DATE = date(1, 1, 1)
_POSTED_KEY = func.coalesce(Result.posted_date, literal(_MIN_DATE, Date))
_SORT_KEY = (Result.verified, _POSTED_KEY, Result.found_at, Result.id)


def parse_bool(value: object) -> bool:
    if isinstance(value, bool):
        return value
    raise ValueError("expected a boolean")


class ResultService:
    def __init__(self, session: AsyncSession, user: User) -> None:
        self.session = session
        self.user = user

    def _visible(self) -> tuple[ColumnElement[bool], ...]:
        return (Result.user_id == self.user.id, Result.visible())

    async def get(self, result_id: uuid.UUID) -> Result:
        result = (
            await self.session.execute(
                select(Result).where(Result.id == result_id, *self._visible())
            )
        ).scalar_one_or_none()
        if result is None:
            raise not_found("Result")
        return result

    async def _page(
        self, conditions: list[ColumnElement[bool]], *, limit: int, cursor: str | None
    ) -> Page[ResultOut]:
        query = select(Result, _POSTED_KEY.label("posted_key")).where(*conditions)
        if cursor:
            verified, posted_key, found_at, rid = decode_cursor(
                cursor, [parse_bool, parse_date, parse_datetime, parse_uuid]
            )
            query = query.where(
                tuple_(*_SORT_KEY)
                < tuple_(
                    literal(verified, Boolean),
                    literal(posted_key, Date),
                    literal(found_at),
                    literal(rid),
                )
            )
        query = query.order_by(*(column.desc() for column in _SORT_KEY)).limit(limit + 1)
        rows = (await self.session.execute(query)).all()
        next_cursor = None
        if len(rows) > limit:
            rows = rows[:limit]
            last, last_key = rows[-1]
            next_cursor = encode_cursor([last.verified, last_key, last.found_at, last.id])
        today = datetime.now(UTC).date()
        return Page[ResultOut](
            items=[result_out(r, today) for r, _ in rows], next_cursor=next_cursor
        )

    async def list_for_search(
        self, search_id: uuid.UUID, *, limit: int, cursor: str | None
    ) -> Page[ResultOut]:
        return await self._page(
            [Result.search_id == search_id, *self._visible()], limit=limit, cursor=cursor
        )

    async def list_feed(
        self,
        *,
        favorite: bool | None,
        unseen: bool | None,
        category: str | None,
        limit: int,
        cursor: str | None,
    ) -> Page[ResultOut]:
        conditions = list(self._visible())
        if favorite is not None:
            conditions.append(Result.is_favorite.is_(favorite))
        if unseen is not None:
            conditions.append(Result.seen.is_(not unseen))
        if category is not None:
            conditions.append(Result.category == category)
        return await self._page(conditions, limit=limit, cursor=cursor)

    async def update(
        self, result_id: uuid.UUID, *, is_favorite: bool | None, seen: bool | None
    ) -> Result:
        result = await self.get(result_id)
        if is_favorite is not None:
            result.is_favorite = is_favorite
        if seen is not None:
            result.seen = seen
        await self.session.commit()
        return result

    async def delete(self, result_id: uuid.UUID) -> None:
        """Hide the result. The row is kept so the same URL is not re-added by monitoring."""
        result = await self.get(result_id)
        result.dismissed_at = datetime.now(UTC)
        result.dismiss_reason = "deleted"
        result.is_favorite = False
        await self.session.commit()

    async def bulk(self, ids: list[str], action: str) -> int:
        result_ids = parse_ids(ids)
        if not result_ids:
            return 0
        where = [Result.id.in_(result_ids), *self._visible()]
        if action == "delete":
            values = {
                "dismissed_at": datetime.now(UTC),
                "dismiss_reason": "deleted",
                "is_favorite": False,
            }
        elif action == "favorite":
            where.append(Result.is_favorite.is_(False))
            values = {"is_favorite": True}
        elif action == "unfavorite":
            where.append(Result.is_favorite.is_(True))
            values = {"is_favorite": False}
        else:  # mark_seen
            where.append(Result.seen.is_(False))
            values = {"seen": True}
        res = await self.session.execute(
            update(Result)
            .where(*where)
            .values(**values)
            .execution_options(synchronize_session=False)
        )
        await self.session.commit()
        return int(res.rowcount or 0)  # type: ignore[attr-defined]

    async def mark_all_seen(self, search_id: uuid.UUID | None) -> int:
        where = [*self._visible(), Result.seen.is_(False)]
        if search_id is not None:
            where.append(Result.search_id == search_id)
        res = await self.session.execute(
            update(Result)
            .where(*where)
            .values(seen=True)
            .execution_options(synchronize_session=False)
        )
        await self.session.commit()
        return int(res.rowcount or 0)  # type: ignore[attr-defined]

    async def unseen_count(self) -> int:
        return int(
            await self.session.scalar(
                select(func.count())
                .select_from(Result)
                .where(*self._visible(), Result.seen.is_(False))
            )
            or 0
        )
