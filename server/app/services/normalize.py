"""URL normalisation and "grounding" checks.

Everything the LLM extracts from a search hit is verified against the hit's own text
(title + snippet + provider date). Values that cannot be found there are dropped, so the
app never shows invented prices, contacts, locations or dates.
"""

from __future__ import annotations

import hashlib
import re
from datetime import date
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

_TRACKING_PARAMS = {
    "gclid",
    "fbclid",
    "msclkid",
    "yclid",
    "igshid",
    "mc_cid",
    "mc_eid",
    "ref",
    "ref_src",
    "srsltid",
    "_ga",
    "_gl",
    "spm",
    "cmpid",
    "trk",
    "trackingid",
    "gsessionid",
}


def is_http_url(url: str) -> bool:
    try:
        parts = urlsplit(url)
    except ValueError:
        return False
    return parts.scheme in ("http", "https") and bool(parts.netloc)


def domain_of(url: str) -> str:
    host = (urlsplit(url).hostname or "").lower()
    return host[4:] if host.startswith("www.") else host


def normalize_url(url: str) -> str:
    """Canonical form used for de-duplication (not for display)."""
    parts = urlsplit(url.strip())
    host = (parts.hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]
    port = parts.port
    netloc = host if port in (None, 80, 443) else f"{host}:{port}"
    query = sorted(
        (k, v)
        for k, v in parse_qsl(parts.query, keep_blank_values=False)
        if not k.lower().startswith("utm_") and k.lower() not in _TRACKING_PARAMS
    )
    path = parts.path or "/"
    if len(path) > 1:
        path = path.rstrip("/")
    return urlunsplit(("https", netloc, path, urlencode(query), ""))


def url_hash(url: str) -> str:
    return hashlib.sha256(normalize_url(url).encode("utf-8")).hexdigest()


# --------------------------------------------------------------------------- grounding

_WS = re.compile(r"\s+")
_DIGIT_JOIN = re.compile(r"(?<=\d)[.,'’\s \-/](?=\d)")


def _collapse(text: str) -> str:
    return _WS.sub(" ", text).strip().lower()


def appears_in(needle: str, haystack: str) -> bool:
    needle_c = _collapse(needle)
    return bool(needle_c) and needle_c in _collapse(haystack)


def digit_groups(text: str) -> list[str]:
    """Digit runs, joining separators used inside numbers ("120.000" -> "120000")."""
    return re.findall(r"\d+", _DIGIT_JOIN.sub("", text))


def price_grounded(price: str, source: str) -> bool:
    digits = "".join(re.findall(r"\d", price))
    if not digits:
        return False
    return digits in digit_groups(source)


def contact_grounded(contact: str, source: str) -> bool:
    if appears_in(contact, source):
        return True
    digits = "".join(re.findall(r"\d", contact))
    if len(digits) >= 6 and "@" not in contact:
        return any(digits in group for group in digit_groups(source))
    return False


def ground_location(location: str, source: str) -> str | None:
    """Keep only the comma-separated parts of a location that literally appear in the source."""
    parts = [p.strip() for p in location.split(",") if len(p.strip()) >= 2]
    kept = [p for p in parts if appears_in(p, source)]
    return ", ".join(kept) if kept else None


def parse_iso_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value.strip()[:10])
    except ValueError:
        return None


_MONTHS: dict[int, tuple[str, ...]] = {
    1: ("gennaio", "january", "enero", "janvier", "januar"),
    2: ("febbraio", "february", "febrero", "février", "februar"),
    3: ("marzo", "march", "mars", "märz"),
    4: ("aprile", "april", "abril", "avril"),
    5: ("maggio", "may", "mayo", "mai"),
    6: ("giugno", "june", "junio", "juin", "juni"),
    7: ("luglio", "july", "julio", "juillet", "juli"),
    8: ("agosto", "august", "août"),
    9: ("settembre", "september", "septiembre", "septembre"),
    10: ("ottobre", "october", "octubre", "octobre", "oktober"),
    11: ("novembre", "november", "noviembre"),
    12: ("dicembre", "december", "diciembre", "décembre", "dezember"),
}
_RELATIVE_MARKERS = (
    "ago",
    "hour",
    "day",
    "week",
    "minute",
    "yesterday",
    "today",
    " fa",
    "ora",
    "ore ",
    "giorn",
    "settiman",
    "ieri",
    "oggi",
    "hace",
    "il y a",
    "vor ",
    "gestern",
    "heute",
    "hier",
    "aujourd",
)


def date_grounded(value: date, source: str, date_text: str | None, *, posted: bool) -> bool:
    """Accept a date only if the source supports it (year, day+month, or a relative date)."""
    text = f"{source} {date_text or ''}".lower()
    if str(value.year) in text:
        return True
    groups = set(re.findall(r"\d+", text))
    words = set(re.findall(r"[a-zà-ÿ]+", text))
    month_words = {form for name in _MONTHS[value.month] for form in (name, name[:3])}
    day_present = str(value.day) in groups or f"{value.day:02d}" in groups
    if day_present and words & month_words:
        return True
    if re.search(rf"\b0?{value.day}[./-]0?{value.month}\b", text):
        return True
    return posted and bool(date_text) and any(m in date_text.lower() for m in _RELATIVE_MARKERS)
