from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.categories import CategoryId
from app.db.models import Result

ResultStatus = Literal["ATTIVO", "SCADUTO", "SCONOSCIUTO"]
SourceTrust = Literal["official", "trusted", "other"]


class ResultOut(BaseModel):
    id: str
    search_id: str
    category: CategoryId
    title: str
    summary: str
    url: str
    source_domain: str
    image_url: str | None
    price: str | None
    location: str | None
    seller_type: str | None
    status: ResultStatus
    posted_date: date | None
    expiry_date: date | None
    contacts: list[str]
    is_favorite: bool
    seen: bool
    found_at: datetime
    verified: bool  # the page was fetched and re-checked (available + matching)
    verified_at: datetime | None
    source_trust: SourceTrust


def result_out(result: Result, today: date | None = None) -> ResultOut:
    today = today or datetime.now(UTC).date()
    status = result.status
    if result.expiry_date is not None and result.expiry_date < today:
        status = "SCADUTO"  # a deadline that passed after the result was found
    return ResultOut(
        id=str(result.id),
        search_id=str(result.search_id),
        category=result.category,  # type: ignore[arg-type]
        title=result.title,
        summary=result.summary,
        url=result.url,
        source_domain=result.source_domain,
        image_url=result.image_url,
        price=result.price,
        location=result.location,
        seller_type=result.seller_type,
        status=status,  # type: ignore[arg-type]
        posted_date=result.posted_date,
        expiry_date=result.expiry_date,
        contacts=list(result.contacts or []),
        is_favorite=result.is_favorite,
        seen=result.seen,
        found_at=result.found_at,
        verified=result.verified,
        verified_at=result.verified_at,
        source_trust=result.source_trust,  # type: ignore[arg-type]
    )


class ResultUpdateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    is_favorite: bool | None = None
    seen: bool | None = None


class ResultBulkIn(BaseModel):
    ids: list[str] = Field(max_length=1000)
    action: Literal["delete", "favorite", "unfavorite", "mark_seen"]


class MarkAllSeenIn(BaseModel):
    search_id: str | None = None
