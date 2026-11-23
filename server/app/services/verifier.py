"""Page verification: check each candidate result on its own page.

Outcomes per candidate (the row dict is updated in place):
- verified: the page shows the item, it is available and matches the request -> fields are
  taken from the page text (same literal-presence guards as the snippet stage, now against
  the page), `verified=True`, `verified_at=now`.
- hidden: the page is gone (404/410), says the item was removed/expired, or clearly does not
  match -> dismissed ("removed", "expired" or "irrelevant").
- unverified: the page could not be checked (blocked, login wall, robots.txt, timeout,
  unreadable, LLM error) -> the result stays unverified. For real estate this means it
  stays out of the feed and can be checked again when rediscovered.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from typing import Any

from app.categories import Category
from app.services.fetcher import FetchedPage, PageFetcher
from app.services.grounding import grounded_fields
from app.services.llm import LLMClient, LLMError, PageVerification, QueryPlan
from app.services.normalize import appears_in
from app.services.search_provider import SearchHit

logger = logging.getLogger(__name__)


@dataclass
class VerificationStats:
    verified: int = 0
    unverified: int = 0
    hidden: dict[str, int] = field(default_factory=dict)
    unverified_reasons: dict[str, int] = field(default_factory=dict)


def _dismiss(row: dict[str, Any], reason: str) -> None:
    row["dismiss_reason"] = reason
    row["dismissed_at"] = datetime.now(UTC)


def apply_page_verification(
    row: dict[str, Any],
    result: PageVerification,
    page: FetchedPage,
    category: Category,
    today: date,
) -> None:
    """Merge page-grounded fields into the row and set verified / dismissal state."""
    if result.page_state == "removed_or_expired":
        _dismiss(row, "removed")
        return
    if not result.relevant:
        _dismiss(row, "irrelevant")
        return

    source = f"{page.title or ''}\n{page.text}"
    fields = grounded_fields(
        source=source,
        date_text=None,
        category=category,
        today=today,
        price=result.price,
        location=result.location,
        seller_type=result.seller_type,
        contacts=result.contacts,
        posted_date=result.posted_date,
        expiry_date=result.expiry_date,
    )
    for key in ("price", "location", "seller_type", "posted_date", "expiry_date"):
        if fields[key] is not None:
            row[key] = fields[key]
    row["contacts"] = list(dict.fromkeys([*fields["contacts"], *row["contacts"]]))[:5]
    if result.title and appears_in(result.title, source):
        row["title"] = " ".join(result.title.split())[:500]
    summary = " ".join((result.summary or "").split())
    if summary:
        row["summary"] = summary[:400]

    expiry = row["expiry_date"]
    if expiry is not None and expiry < today:
        row["status"] = "SCADUTO"
        _dismiss(row, "expired")
        return
    row["status"] = "ATTIVO"  # the page shows the item as available
    row["verified"] = True
    row["verified_at"] = datetime.now(UTC)


class ResultVerifier:
    def __init__(self, fetcher: PageFetcher, llm: LLMClient, *, concurrency: int = 6) -> None:
        self._fetcher = fetcher
        self._llm = llm
        self._concurrency = max(1, concurrency)

    async def verify_rows(
        self,
        *,
        search_id: Any,
        query: str,
        category: Category,
        language: str,
        plan: QueryPlan,
        candidates: list[tuple[SearchHit, dict[str, Any]]],
        today: date,
    ) -> VerificationStats:
        stats = VerificationStats()
        semaphore = asyncio.Semaphore(self._concurrency)

        async def one(hit: SearchHit, row: dict[str, Any]) -> None:
            async with semaphore:
                try:
                    outcome = await self._verify_one(
                        hit,
                        row,
                        query=query,
                        category=category,
                        language=language,
                        plan=plan,
                        today=today,
                    )
                except Exception:
                    logger.exception("Verification failed for %s", hit.source_domain)
                    outcome = "unverified:internal_error"
            kind, _, reason = outcome.partition(":")
            if kind == "verified":
                stats.verified += 1
            elif kind == "hidden":
                stats.hidden[reason] = stats.hidden.get(reason, 0) + 1
            else:
                stats.unverified += 1
                stats.unverified_reasons[reason] = stats.unverified_reasons.get(reason, 0) + 1
            logger.info(
                "verify search=%s outcome=%s domain=%s title=%r",
                search_id,
                outcome,
                hit.source_domain,
                hit.title[:80],
            )

        await asyncio.gather(*(one(hit, row) for hit, row in candidates))
        return stats

    async def _verify_one(
        self,
        hit: SearchHit,
        row: dict[str, Any],
        *,
        query: str,
        category: Category,
        language: str,
        plan: QueryPlan,
        today: date,
    ) -> str:
        page = await self._fetcher.fetch(hit.url)
        if page.status == "not_found":
            _dismiss(row, "removed")
            return "hidden:removed(http_404)"
        if page.status != "ok":
            detail = page.detail or (str(page.http_status) if page.http_status else "")
            return f"unverified:{page.status}" + (f"({detail})" if detail else "")
        try:
            result = await self._llm.verify_page(
                query=query,
                category=category,
                language=language,
                plan=plan,
                hit=hit,
                page_title=page.title,
                page_text=page.text,
                today=today,
            )
        except LLMError as exc:
            return f"unverified:llm_error({exc})"
        if result.page_state == "blocked_or_unreadable":
            return "unverified:unreadable_page"
        apply_page_verification(row, result, page, category, today)
        if row["dismiss_reason"]:
            note = (result.relevance_reason or "")[:160]
            return f"hidden:{row['dismiss_reason']}" + (f"({note})" if note else "")
        return "verified"
