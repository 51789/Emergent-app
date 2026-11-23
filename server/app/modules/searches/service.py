from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import delete, func, select, tuple_, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.categories import CATEGORY_IDS
from app.core.config import Settings
from app.core.errors import AppError, not_found
from app.core.ids import parse_ids
from app.core.pagination import Page, decode_cursor, encode_cursor, parse_datetime, parse_uuid
from app.core.plans import PlanDef, effective_plan, get_plan
from app.db.models import Result, Search, User
from app.modules.searches import repo
from app.modules.searches.schemas import (
    CategoryCount,
    SearchCreateIn,
    SearchOut,
    search_out,
)


class SearchService:
    def __init__(self, session: AsyncSession, settings: Settings, user: User) -> None:
        self.session = session
        self.settings = settings
        self.user = user

    # ------------------------------------------------------------------ helpers

    @property
    def plan(self) -> PlanDef:
        return get_plan(
            effective_plan(
                self.user.plan, self.user.plan_expires_at, self.settings.plan_expiry_grace_hours
            )
        )

    def _limit_error(self) -> AppError:
        plan = self.plan
        return AppError(
            402,
            "plan_limit_reached",
            f"The {plan.name} plan allows up to {plan.max_active_searches} active searches",
        )

    async def get(self, search_id: uuid.UUID) -> Search:
        search = await repo.get_owned(self.session, self.user.id, search_id)
        if search is None:
            raise not_found("Search")
        return search

    async def to_out(self, searches: list[Search]) -> list[SearchOut]:
        counts = await repo.result_counts(self.session, [s.id for s in searches])
        return [search_out(s, *counts.get(s.id, (0, 0))) for s in searches]

    async def one_out(self, search: Search) -> SearchOut:
        return (await self.to_out([search]))[0]

    def _next_run_on_activate(self) -> Any:
        """Run now, unless the last run is more recent than the plan interval."""
        now = datetime.now(UTC)
        return func.greatest(
            now, Search.last_run_at + timedelta(hours=self.plan.refresh_interval_hours)
        )

    # ------------------------------------------------------------------ queries

    async def list(
        self,
        *,
        category: str | None,
        is_active: bool | None,
        limit: int,
        cursor: str | None,
    ) -> Page[SearchOut]:
        query = select(Search).where(Search.user_id == self.user.id)
        if category is not None:
            query = query.where(Search.category == category)
        if is_active is not None:
            query = query.where(Search.is_active.is_(is_active))
        if cursor:
            created_at, sid = decode_cursor(cursor, [parse_datetime, parse_uuid])
            query = query.where(tuple_(Search.created_at, Search.id) < tuple_(created_at, sid))
        query = query.order_by(Search.created_at.desc(), Search.id.desc()).limit(limit + 1)
        rows = list((await self.session.execute(query)).scalars())
        next_cursor = None
        if len(rows) > limit:
            rows = rows[:limit]
            next_cursor = encode_cursor([rows[-1].created_at, rows[-1].id])
        return Page[SearchOut](items=await self.to_out(rows), next_cursor=next_cursor)

    async def counts(self) -> dict[str, CategoryCount]:
        active = dict(
            (
                await self.session.execute(
                    select(Search.category, func.count())
                    .where(Search.user_id == self.user.id, Search.is_active.is_(True))
                    .group_by(Search.category)
                )
            ).all()
        )
        unseen = dict(
            (
                await self.session.execute(
                    select(Result.category, func.count())
                    .where(
                        Result.user_id == self.user.id,
                        Result.seen.is_(False),
                        Result.visible(),
                    )
                    .group_by(Result.category)
                )
            ).all()
        )
        return {
            cat: CategoryCount(active=int(active.get(cat, 0)), unseen=int(unseen.get(cat, 0)))
            for cat in CATEGORY_IDS
        }

    # ------------------------------------------------------------------ commands

    async def create(self, data: SearchCreateIn) -> Search:
        await repo.lock_user(self.session, self.user.id)
        if await repo.count_active(self.session, self.user.id) >= self.plan.max_active_searches:
            raise self._limit_error()
        search = Search(
            id=uuid.uuid4(),
            user_id=self.user.id,
            query=data.query,
            category=data.category,
            language=data.language or self.user.language,
            is_active=True,
            last_run_status="pending",
            next_run_at=datetime.now(UTC),
        )
        self.session.add(search)
        await self.session.commit()
        return search

    async def set_active(self, search_id: uuid.UUID, is_active: bool) -> Search:
        await repo.lock_user(self.session, self.user.id)
        search = await self.get(search_id)
        if is_active and not search.is_active:
            if await repo.count_active(self.session, self.user.id) >= self.plan.max_active_searches:
                raise self._limit_error()
            await self.session.execute(
                update(Search)
                .where(Search.id == search.id)
                .values(is_active=True, next_run_at=self._next_run_on_activate())
            )
        elif not is_active and search.is_active:
            await self.session.execute(
                update(Search)
                .where(Search.id == search.id)
                .values(is_active=False, next_run_at=None)
            )
        await self.session.commit()
        await self.session.refresh(search)
        return search

    async def delete(self, search_id: uuid.UUID) -> None:
        result = await self.session.execute(
            delete(Search).where(Search.id == search_id, Search.user_id == self.user.id)
        )
        if result.rowcount == 0:  # type: ignore[attr-defined]
            raise not_found("Search")
        await self.session.commit()

    async def request_run(self, search_id: uuid.UUID) -> Search:
        search = await self.get(search_id)
        now = datetime.now(UTC)
        cooldown = timedelta(seconds=self.settings.manual_run_cooldown_seconds)
        running = search.last_run_status == "running" and (search.next_run_at or now) > now
        recent = (
            search.last_run_started_at is not None and search.last_run_started_at > now - cooldown
        )
        if running or recent:
            retry_after = cooldown
            if search.last_run_started_at is not None:
                retry_after = max(timedelta(seconds=1), search.last_run_started_at + cooldown - now)
            raise AppError(
                429,
                "rate_limited",
                "This search was refreshed recently; try again in a few minutes",
                headers={"Retry-After": str(int(retry_after.total_seconds()))},
            )
        search.last_run_status = "pending"
        search.next_run_at = now
        await self.session.commit()
        return search

    async def bulk(self, ids: list[str], action: str) -> int:
        search_ids = parse_ids(ids)
        if not search_ids:
            return 0
        owned = (Search.user_id == self.user.id, Search.id.in_(search_ids))
        if action == "delete":
            result = await self.session.execute(delete(Search).where(*owned))
        elif action == "deactivate":
            result = await self.session.execute(
                update(Search)
                .where(*owned, Search.is_active.is_(True))
                .values(is_active=False, next_run_at=None)
            )
        else:  # activate
            await repo.lock_user(self.session, self.user.id)
            to_activate = int(
                await self.session.scalar(
                    select(func.count())
                    .select_from(Search)
                    .where(*owned, Search.is_active.is_(False))
                )
                or 0
            )
            active = await repo.count_active(self.session, self.user.id)
            if to_activate and active + to_activate > self.plan.max_active_searches:
                raise self._limit_error()
            result = await self.session.execute(
                update(Search)
                .where(*owned, Search.is_active.is_(False))
                .values(is_active=True, next_run_at=self._next_run_on_activate())
            )
        await self.session.commit()
        return int(result.rowcount or 0)  # type: ignore[attr-defined]
