from __future__ import annotations

import uuid
from collections.abc import Iterable

from app.core.errors import not_found


def parse_id(value: str, what: str = "Resource") -> uuid.UUID:
    """Parse a path id; malformed ids are reported as 404 (they cannot exist)."""
    try:
        return uuid.UUID(value)
    except (ValueError, AttributeError, TypeError) as exc:
        raise not_found(what) from exc


def parse_ids(values: Iterable[str]) -> list[uuid.UUID]:
    """Parse a list of ids, silently dropping malformed ones."""
    out: list[uuid.UUID] = []
    for value in values:
        try:
            out.append(uuid.UUID(str(value)))
        except ValueError:
            continue
    return list(dict.fromkeys(out))
