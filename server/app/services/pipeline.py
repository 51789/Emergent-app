"""The monitoring pipeline: plan -> web search -> extract/verify -> dedupe/store -> notify.

1. The LLM turns the user's request into structured filters, keywords and 1-3 web queries.
   Plans are reused while productive and their date bounds are current.
2. The search provider (Serper) returns REAL results (URLs come only from the provider).
3. The LLM reads only the returned title/snippet/date and extracts fields; everything it
   returns is re-verified against the source text (services/normalize.py). Irrelevant and
   expired items are kept as hidden rows so they are never re-evaluated or re-added.
4. Property hits stay pending until their page is verified. On rediscovery, only pending
   rows can be updated. Notifications count results that have just become visible.
Without a search provider the run ends with status "no_provider" and stores nothing.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Any, Literal

from sqlalchemy import case, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError

from app.categories import Category, classify_source, get_category
from app.core.config import Settings
from app.core.plans import effective_plan, get_plan
from app.db.models import PENDING_VERIFICATION, Result, Search, User
from app.db.session import SessionMaker
from app.services.grounding import grounded_fields
from app.services.llm import ExtractedItem, LLMClient, LLMError, QueryPlan
from app.services.normalize import url_hash
from app.services.notifier import PushNotifier
from app.services.search_provider import SearchHit, SearchProvider, SearchProviderError
from app.services.verifier import ResultVerifier

logger = logging.getLogger(__name__)

Trigger = Literal["initial", "manual", "scheduled"]
EXTRACT_CHUNK = 15
NO_PROVIDER_MESSAGE = "No web search provider configured (set SERPER_API_KEY)."


@dataclass
class RunOutcome:
    status: Literal["ok", "error", "no_provider", "skipped"]
    new_results: int = 0
    error: str | None = None


def _today() -> date:
    return datetime.now(UTC).date()


def build_row(
    hit: SearchHit, item: ExtractedItem | None, category: Category, today: date
) -> dict[str, Any]:
    """Turn a provider hit (+ optional LLM extraction) into a results row (snippet-grounded)."""
    row: dict[str, Any] = {
        "title": hit.title[:500],
        "url": hit.url,
        "url_hash": url_hash(hit.url),
        "source_domain": hit.source_domain[:255],
        "source_trust": classify_source(hit.url, category),
        "image_url": hit.image_url,
        "summary": hit.snippet[:400],
        "price": None,
        "location": None,
        "seller_type": None,
        "contacts": [],
        "posted_date": None,
        "expiry_date": None,
        "status": "SCONOSCIUTO",
        "verified": False,
        "verified_at": None,
        "dismissed_at": None,
        "dismiss_reason": None,
    }
    if item is None:  # no LLM configured: raw provider data only
        return row

    summary = " ".join((item.summary or "").split())
    if summary:
        row["summary"] = summary[:400]
    row.update(
        grounded_fields(
            source=f"{hit.title}\n{hit.snippet}",
            date_text=hit.date_text,
            category=category,
            today=today,
            price=item.price,
            location=item.location,
            seller_type=item.seller_type,
            contacts=item.contacts,
            posted_date=item.posted_date,
            expiry_date=item.expiry_date,
        )
    )
    expiry = row["expiry_date"]
    if expiry is not None:
        row["status"] = "ATTIVO" if expiry >= today else "SCADUTO"
    elif item.listing_status == "expired":
        row["status"] = "SCADUTO"
    elif item.listing_status == "active":
        row["status"] = "ATTIVO"

    if not item.relevant:
        dismiss(row, "irrelevant")
    elif row["status"] == "SCADUTO":
        dismiss(row, "expired")
    return row


def dismiss(row: dict[str, Any], reason: str) -> None:
    row["dismiss_reason"] = reason
    row["dismissed_at"] = datetime.now(UTC)


def _public_error(exc: BaseException) -> str:
    if isinstance(exc, LLMError | SearchProviderError):
        return str(exc)[:500]
    return "Internal error while running the search."


class SearchPipeline:
    def __init__(
        self,
        *,
        sessionmaker: SessionMaker,
        settings: Settings,
        llm: LLMClient | None,
        provider: SearchProvider | None,
        notifier: PushNotifier | None,
        verifier: ResultVerifier | None = None,
    ) -> None:
        self._sm = sessionmaker
        self._settings = settings
        self._llm = llm
        self._provider = provider
        self._notifier = notifier
        self._verifier = verifier

    # ------------------------------------------------------------------ claiming

    async def claim_due(self, limit: int) -> list[uuid.UUID]:
        """Atomically claim up to `limit` due, active searches (safe across workers).

        Rows are locked with FOR UPDATE SKIP LOCKED and their next_run_at is pushed forward by
        the lease, so other workers skip them while they run; if a worker dies mid-run the
        search becomes due again when the lease expires.
        """
        now = datetime.now(UTC)
        due = (
            select(Search.id)
            .where(Search.is_active.is_(True), Search.next_run_at <= now)
            .order_by(Search.next_run_at)
            .limit(limit)
            .with_for_update(skip_locked=True)
        )
        return await self._claim(due, now)

    async def claim(self, search_id: uuid.UUID, *, include_inactive: bool = False) -> bool:
        now = datetime.now(UTC)
        query = select(Search.id).where(Search.id == search_id, Search.next_run_at <= now)
        if not include_inactive:
            query = query.where(Search.is_active.is_(True))
        return bool(await self._claim(query.with_for_update(skip_locked=True), now))

    async def _claim(self, subquery: Any, now: datetime) -> list[uuid.UUID]:
        lease_until = now + timedelta(seconds=self._settings.search_lease_seconds)
        stmt = (
            update(Search)
            .where(Search.id.in_(subquery.scalar_subquery()))
            .values(last_run_status="running", last_run_started_at=now, next_run_at=lease_until)
            .returning(Search.id)
            .execution_options(synchronize_session=False)
        )
        async with self._sm() as session:
            ids = list((await session.execute(stmt)).scalars())
            await session.commit()
        return ids

    # ------------------------------------------------------------------ running

    async def run(self, search_id: uuid.UUID, *, trigger: Trigger) -> RunOutcome:
        """Claim one search and execute it (used for initial and manual runs)."""
        if not await self.claim(search_id, include_inactive=trigger != "scheduled"):
            return RunOutcome("skipped")
        return await self.execute(search_id, trigger=trigger)

    async def execute(self, search_id: uuid.UUID, *, trigger: Trigger) -> RunOutcome:
        """Execute an already-claimed search. Never raises."""
        try:
            return await self._execute(search_id, trigger)
        except Exception as exc:
            if not isinstance(exc, LLMError | SearchProviderError):
                logger.exception("Search %s failed", search_id)
            else:
                logger.warning("Search %s failed: %s", search_id, exc)
            message = _public_error(exc)
            try:
                await self._finish(search_id, status="error", error=message)
            except Exception:
                logger.exception("Could not record failure for search %s", search_id)
            return RunOutcome("error", error=message)

    async def _execute(self, search_id: uuid.UUID, trigger: Trigger) -> RunOutcome:
        async with self._sm() as session:
            row = (
                await session.execute(
                    select(Search, User.plan, User.plan_expires_at, User.language)
                    .join(User, User.id == Search.user_id)
                    .where(Search.id == search_id)
                )
            ).one_or_none()
        if row is None:
            return RunOutcome("skipped")
        search, plan_id, plan_expires_at, user_language = row
        plan = get_plan(
            effective_plan(plan_id, plan_expires_at, self._settings.plan_expiry_grace_hours)
        )
        interval = plan.refresh_interval_hours

        if self._provider is None:
            await self._finish(
                search_id, status="no_provider", error=NO_PROVIDER_MESSAGE, interval_hours=interval
            )
            return RunOutcome("no_provider")

        category = get_category(search.category)
        today = _today()
        query_plan = await self._ensure_plan(search, category, today)
        hits = await self._web_search(search, category, query_plan)
        hits_to_check = await self._hits_to_check(search.id, hits)
        pairs = await self._extract_rows(search, category, query_plan, hits_to_check, today)
        candidates = [(hit, row) for hit, row in pairs if not row["dismiss_reason"]]
        stats = None
        if self._verifier is not None and candidates:
            stats = await self._verifier.verify_rows(
                search_id=search.id,
                query=search.query,
                category=category,
                language=search.language,
                plan=query_plan,
                candidates=candidates,
                today=today,
            )
        rows = [row for _, row in pairs]
        if category.id == "immobili":
            for row in rows:
                if not row["verified"] and row["dismissed_at"] is None:
                    dismiss(row, PENDING_VERIFICATION)
        new_titles = await self._store(search, rows)
        await self._finish(search_id, status="ok", interval_hours=interval)
        logger.info(
            "run search=%s hits=%d to_check=%d snippet_candidates=%d verified=%s unverified=%s "
            "hidden_at_verify=%s stored_visible=%d",
            search.id,
            len(hits),
            len(hits_to_check),
            len(candidates),
            stats.verified if stats else "-",
            stats.unverified if stats else "-",
            stats.hidden if stats else "-",
            len(new_titles),
        )

        if new_titles and trigger == "scheduled" and self._notifier is not None:
            try:
                await self._notifier.notify_new_results(
                    user_id=search.user_id,
                    search_id=search.id,
                    category=category,
                    query=search.query,
                    count=len(new_titles),
                    first_title=new_titles[0],
                    language=user_language,
                )
            except Exception:
                logger.exception("Push notification failed for search %s", search.id)
        return RunOutcome("ok", new_results=len(new_titles))

    async def _ensure_plan(self, search: Search, category: Category, today: date) -> QueryPlan:
        if search.planned_at is not None and search.web_queries:
            cached = QueryPlan(
                summary=search.summary,
                keywords=list(search.keywords),
                filters=dict(search.filters),
                web_queries=list(search.web_queries),
            )
            if self._llm is None or await self._reuse_plan(search, cached, today):
                return cached
        if self._llm is None:
            # Degraded mode: search the raw request; nothing is persisted so a proper plan is
            # produced once an LLM key is configured.
            return QueryPlan(summary=None, web_queries=[search.query[:200]])

        plan = await self._llm.plan_search(
            query=search.query, category=category, language=search.language, today=today
        )
        if not plan.web_queries:
            plan.web_queries = [search.query[:200]]
        async with self._sm() as session:
            await session.execute(
                update(Search)
                .where(Search.id == search.id)
                .values(
                    summary=plan.summary,
                    keywords=plan.keywords,
                    filters=plan.filters,
                    web_queries=plan.web_queries,
                    planned_at=datetime.now(UTC),
                )
            )
            await session.commit()
        return plan

    async def _reuse_plan(self, search: Search, cached: QueryPlan, today: date) -> bool:
        # Refresh publication windows and search terms such as the upcoming closing month.
        dated = cached.has_date_bounds or search.category in ("bandi", "nuove_leggi")
        if dated and search.planned_at.date() != today:
            return False
        if search.last_run_at is None:
            return True
        async with self._sm() as session:
            visible = select(Result.id).where(Result.search_id == search.id, Result.visible())
            return bool(await session.scalar(select(visible.exists())))

    async def _web_search(
        self, search: Search, category: Category, plan: QueryPlan
    ) -> list[SearchHit]:
        assert self._provider is not None
        recency = None if plan.has_date_bounds else category.recency
        responses = await asyncio.gather(
            *(
                self._provider.search(
                    q,
                    language=search.language,
                    country=self._settings.search_country,
                    num=self._settings.search_results_per_query,
                    recency=recency,
                )
                for q in plan.web_queries
            ),
            return_exceptions=True,
        )
        hits: list[SearchHit] = []
        errors: list[BaseException] = []
        for response in responses:
            if isinstance(response, BaseException):
                errors.append(response)
            else:
                hits.extend(response)
        if errors and not hits:
            raise errors[0]
        # De-duplicate within this run by normalised URL (first occurrence wins).
        unique: dict[str, SearchHit] = {}
        for hit in hits:
            unique.setdefault(url_hash(hit.url), hit)
        return list(unique.values())

    async def _hits_to_check(self, search_id: uuid.UUID, hits: list[SearchHit]) -> list[SearchHit]:
        if not hits:
            return []
        hashes = [url_hash(h.url) for h in hits]
        async with self._sm() as session:
            known = set(
                (
                    await session.execute(
                        select(Result.url_hash).where(
                            Result.search_id == search_id,
                            Result.url_hash.in_(hashes),
                            ~Result.pending_verification(),
                        )
                    )
                ).scalars()
            )
        return [h for h, digest in zip(hits, hashes, strict=True) if digest not in known]

    async def _extract_rows(
        self,
        search: Search,
        category: Category,
        plan: QueryPlan,
        hits: Sequence[SearchHit],
        today: date,
    ) -> list[tuple[SearchHit, dict[str, Any]]]:
        if not hits:
            return []
        if self._llm is None:
            return [(hit, build_row(hit, None, category, today)) for hit in hits]

        chunks = [hits[i : i + EXTRACT_CHUNK] for i in range(0, len(hits), EXTRACT_CHUNK)]
        llm = self._llm
        extracted = await asyncio.gather(
            *(
                llm.extract(
                    query=search.query,
                    category=category,
                    language=search.language,
                    plan=plan,
                    hits=chunk,
                    today=today,
                )
                for chunk in chunks
            )
        )
        rows: list[tuple[SearchHit, dict[str, Any]]] = []
        for chunk, items in zip(chunks, extracted, strict=True):
            by_index = {item.index: item for item in items}
            for i, hit in enumerate(chunk):
                item = by_index.get(i)
                if item is None:
                    continue  # not evaluated: leave unknown so the next run retries it
                row = build_row(hit, item, category, today)
                if row["dismiss_reason"]:
                    logger.info(
                        "hit dismissed search=%s reason=%s domain=%s title=%r note=%r",
                        search.id,
                        row["dismiss_reason"],
                        hit.source_domain,
                        hit.title[:80],
                        (item.relevance_reason or "")[:200],
                    )
                rows.append((hit, row))
        return rows

    async def _store(self, search: Search, rows: list[dict[str, Any]]) -> list[str]:
        """Publish a URL at most once, preserving user state when a pending hit is verified."""
        if not rows:
            return []
        found_at = datetime.now(UTC)
        insert = pg_insert(Result).values(
            [
                dict(
                    row,
                    search_id=search.id,
                    user_id=search.user_id,
                    category=search.category,
                    found_at=found_at,
                )
                for row in rows
            ]
        )
        stmt = insert.on_conflict_do_update(
            index_elements=[Result.search_id, Result.url_hash],
            set_={key: insert.excluded[key] for key in rows[0] if key != "url_hash"},
            where=Result.pending_verification(),
        ).returning(Result.title, Result.visible())
        async with self._sm() as session:
            try:
                returned = (await session.execute(stmt)).all()
                await session.commit()
            except IntegrityError:
                # The search (or user) was deleted while running.
                await session.rollback()
                return []
        return [title for title, visible in returned if visible]

    async def _finish(
        self,
        search_id: uuid.UUID,
        *,
        status: str,
        error: str | None = None,
        interval_hours: int = 24,
    ) -> None:
        now = datetime.now(UTC)
        if status == "error":
            delay = min(
                timedelta(minutes=self._settings.error_retry_minutes),
                timedelta(hours=interval_hours),
            )
        else:
            delay = timedelta(hours=interval_hours)
        async with self._sm() as session:
            await session.execute(
                update(Search)
                .where(Search.id == search_id)
                .values(
                    last_run_status=status,
                    last_run_at=now,
                    last_error=error,
                    next_run_at=case((Search.is_active.is_(True), now + delay), else_=None),
                )
            )
            await session.commit()
