from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.categories import CategoryId, LanguageCode
from app.db.models import Search

RunStatus = Literal["pending", "running", "ok", "error", "no_provider"]
QueryText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=500)]


class SearchCreateIn(BaseModel):
    query: QueryText
    category: CategoryId
    language: LanguageCode | None = None  # defaults to the user's language


class SearchUpdateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    is_active: bool | None = None


class SearchBulkIn(BaseModel):
    ids: list[str] = Field(max_length=500)
    action: Literal["delete", "activate", "deactivate"]


class BulkOut(BaseModel):
    affected: int


class SearchOut(BaseModel):
    id: str
    query: str
    category: CategoryId
    language: LanguageCode
    is_active: bool
    filters: dict[str, Any]
    keywords: list[str]
    summary: str | None
    created_at: datetime
    last_run_at: datetime | None
    last_run_status: RunStatus
    last_error: str | None
    next_run_at: datetime | None
    results_count: int
    unseen_count: int


class CategoryCount(BaseModel):
    active: int
    unseen: int


def search_out(search: Search, results_count: int = 0, unseen_count: int = 0) -> SearchOut:
    return SearchOut(
        id=str(search.id),
        query=search.query,
        category=search.category,  # type: ignore[arg-type]
        language=search.language,  # type: ignore[arg-type]
        is_active=search.is_active,
        filters=dict(search.filters or {}),
        keywords=list(search.keywords or []),
        summary=search.summary,
        created_at=search.created_at,
        last_run_at=search.last_run_at,
        last_run_status=search.last_run_status,  # type: ignore[arg-type]
        last_error=search.last_error,
        next_run_at=search.next_run_at,
        results_count=results_count,
        unseen_count=unseen_count,
    )
