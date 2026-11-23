"""Keep only LLM-extracted values that are literally supported by a source text.

Used for both the search snippet (pipeline extraction) and the fetched page text
(verification), so the anti-fabrication rules are identical in both stages.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import date, timedelta
from typing import Any

from app.categories import Category
from app.services.normalize import (
    contact_grounded,
    date_grounded,
    ground_location,
    parse_iso_date,
    price_grounded,
)


def grounded_fields(
    *,
    source: str,
    date_text: str | None,
    category: Category,
    today: date,
    price: str | None,
    location: str | None,
    seller_type: str | None,
    contacts: Sequence[str],
    posted_date: str | None,
    expiry_date: str | None,
) -> dict[str, Any]:
    """Return the subset of values present in `source` (others become None / [])."""
    out: dict[str, Any] = {
        "price": None,
        "location": None,
        "seller_type": None,
        "contacts": [],
        "posted_date": None,
        "expiry_date": None,
    }
    if price and price_grounded(price, source):
        out["price"] = " ".join(price.split())[:120]
    if location:
        grounded = ground_location(location, source)
        out["location"] = grounded[:255] if grounded else None
    if seller_type:
        wanted = seller_type.strip().lower()
        out["seller_type"] = next((s for s in category.seller_types if s.lower() == wanted), None)
    kept: list[str] = []
    for contact in contacts:
        c = " ".join(contact.split())
        if c and c not in kept and contact_grounded(c, source):
            kept.append(c[:200])
    out["contacts"] = kept[:5]

    posted = parse_iso_date(posted_date)
    if posted and (
        posted.year < 2000
        or posted > today + timedelta(days=1)
        or not date_grounded(posted, source, date_text, posted=True)
    ):
        posted = None
    expiry = parse_iso_date(expiry_date)
    if expiry and (
        expiry.year < 2000 or not date_grounded(expiry, source, date_text, posted=False)
    ):
        expiry = None
    out["posted_date"] = posted
    out["expiry_date"] = expiry
    return out
