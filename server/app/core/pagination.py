"""Keyset (cursor) pagination helpers. Cursors are opaque base64url-encoded JSON arrays."""

from __future__ import annotations

import base64
import binascii
import json
import uuid
from collections.abc import Callable, Sequence
from datetime import date, datetime
from typing import Annotated, Any, Generic, TypeVar

from fastapi import Query
from pydantic import BaseModel

from app.core.errors import AppError

T = TypeVar("T")

DEFAULT_LIMIT = 20
MAX_LIMIT = 100


class Page(BaseModel, Generic[T]):
    items: list[T]
    next_cursor: str | None


def clamp_limit(limit: int | None) -> int:
    if limit is None:
        return DEFAULT_LIMIT
    return max(1, min(int(limit), MAX_LIMIT))


LimitParam = Annotated[int, Query(ge=1, description="Page size (max 100)")]
CursorParam = Annotated[str | None, Query(description="Opaque cursor from next_cursor")]


def _encode_value(value: Any) -> Any:
    if isinstance(value, datetime | date):
        return value.isoformat()
    if isinstance(value, uuid.UUID):
        return str(value)
    return value


def encode_cursor(values: Sequence[Any]) -> str:
    raw = json.dumps([_encode_value(v) for v in values], separators=(",", ":"))
    return base64.urlsafe_b64encode(raw.encode()).decode().rstrip("=")


def decode_cursor(cursor: str, parsers: Sequence[Callable[[Any], Any]]) -> list[Any]:
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        values = json.loads(base64.urlsafe_b64decode(padded.encode()).decode())
        if not isinstance(values, list) or len(values) != len(parsers):
            raise ValueError("bad cursor shape")
        return [parse(v) for parse, v in zip(parsers, values, strict=True)]
    except (ValueError, TypeError, binascii.Error, UnicodeDecodeError) as exc:
        raise AppError(400, "invalid_cursor", "The pagination cursor is invalid") from exc


def parse_datetime(value: Any) -> datetime:
    dt = datetime.fromisoformat(str(value))
    if dt.tzinfo is None:
        raise ValueError("naive datetime in cursor")
    return dt


def parse_date(value: Any) -> date:
    return date.fromisoformat(str(value))


def parse_uuid(value: Any) -> uuid.UUID:
    return uuid.UUID(str(value))
