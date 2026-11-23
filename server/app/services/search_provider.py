"""Web search providers behind a small interface (Serper today; Brave/Tavily can be added)."""

from __future__ import annotations

import asyncio
import html as html_lib
import logging
import re
from dataclasses import dataclass, replace
from typing import Protocol
from urllib.parse import parse_qs, urljoin, urlsplit

import httpx

from app.core.config import Settings
from app.services.normalize import domain_of, is_http_url

logger = logging.getLogger(__name__)

_REDIRECT_STATUSES = {301, 302, 303, 307, 308}


_HREF_RE = re.compile(r"""href=["'](https?://[^"'<>\s]+)["']""", re.IGNORECASE)


def decode_google_redirect(url: str) -> str | None:
    """Target of a `google.*/url?q=...` (or `url=`) link when it is a plain http(s) URL."""
    parts = urlsplit(url)
    if not is_google_redirect(url):
        return None
    params = parse_qs(parts.query)
    for key in ("q", "url"):
        for value in params.get(key, []):
            if is_http_url(value) and not is_google_redirect(value):
                return value
    return None


def _interstitial_target(html: str) -> str | None:
    """First non-Google link on a Google "redirect notice" page."""
    for match in _HREF_RE.finditer(html):
        candidate = html_lib.unescape(match.group(1))
        host = (urlsplit(candidate).hostname or "").lower()
        if is_http_url(candidate) and "google." not in host and "gstatic." not in host:
            return candidate
    return None


def is_google_redirect(url: str) -> bool:
    """Google wrapper links (`google.com/goto?url=...`, `/url?q=...`) that hide the real URL."""
    parts = urlsplit(url)
    host = (parts.hostname or "").lower()
    is_google = host.startswith(("google.", "www.google."))
    return is_google and parts.path in ("/goto", "/url")


@dataclass(frozen=True)
class SearchHit:
    title: str
    url: str
    snippet: str
    source_domain: str
    date_text: str | None = None  # as reported by the provider ("3 days ago", "12 nov 2026")
    image_url: str | None = None
    position: int = 0


class SearchProviderError(Exception):
    def __init__(self, message: str, *, retryable: bool = True) -> None:
        super().__init__(message)
        self.retryable = retryable


class SearchProvider(Protocol):
    name: str

    async def search(
        self,
        query: str,
        *,
        language: str,
        country: str | None,
        num: int,
        recency: str | None,
    ) -> list[SearchHit]: ...


class SerperProvider:
    """Google results via https://serper.dev (POST /search)."""

    name = "serper"
    endpoint = "https://google.serper.dev/search"

    def __init__(self, api_key: str, http: httpx.AsyncClient, timeout: float = 20.0) -> None:
        self._api_key = api_key
        self._http = http
        self._timeout = timeout

    async def search(
        self,
        query: str,
        *,
        language: str,
        country: str | None,
        num: int,
        recency: str | None,
    ) -> list[SearchHit]:
        payload: dict[str, object] = {"q": query, "hl": language, "num": num}
        if country:
            payload["gl"] = country
        if recency:
            payload["tbs"] = recency
        hits = self._parse(await self._request(payload))
        resolved, missing = await self._unwrap_redirects(hits)
        if missing is not None:
            # Some regions return a validation page. Ask the provider for direct links on
            # the displayed source. Never construct a destination from its breadcrumbs.
            title = " ".join(re.findall(r"\w+", missing.title))
            if missing.title.rstrip().endswith(("...", "…")):
                # Serper often repeats the complete, street-specific title in the snippet.
                lead = re.split(r"[·|\n]", missing.snippet, maxsplit=1)[0]
                expanded = " ".join(re.findall(r"\w+", lead))
                if title and expanded.casefold().startswith(title.casefold() + " "):
                    title = expanded
            title = title[:150]
            lookup = dict(payload, q=f"site:{missing.source_domain} {title}", num=min(5, num))
            try:
                alternatives = self._parse(await self._request(lookup))
            except SearchProviderError:
                logger.info("Source lookup unavailable for %s", missing.source_domain)
            else:
                seen = {h.url for h in resolved}
                for h in alternatives:
                    if domain_of(h.url) == missing.source_domain and h.url not in seen:
                        seen.add(h.url)
                        resolved.append(h)
        return resolved[:num]

    async def _request(self, payload: dict[str, object]) -> dict:
        try:
            response = await self._http.post(
                self.endpoint,
                json=payload,
                headers={"X-API-KEY": self._api_key, "Content-Type": "application/json"},
                timeout=self._timeout,
            )
        except httpx.HTTPError as exc:
            raise SearchProviderError(f"Serper request failed: {exc.__class__.__name__}") from exc

        if response.status_code in (401, 403):
            raise SearchProviderError("Serper rejected the API key", retryable=False)
        if response.status_code == 429:
            raise SearchProviderError("Serper rate limit or quota exceeded")
        if response.status_code >= 400:
            raise SearchProviderError(f"Serper returned HTTP {response.status_code}")

        try:
            data = response.json()
        except ValueError as exc:
            raise SearchProviderError("Serper returned invalid JSON") from exc
        return data

    async def _unwrap_redirects(
        self, hits: list[SearchHit]
    ) -> tuple[list[SearchHit], SearchHit | None]:
        """Replace Google redirect wrappers with their destination; drop unresolvable ones.

        The wrappers carry per-session tokens, so keeping them would break de-duplication and
        show "google.com" as the source.
        """

        async def resolve(hit: SearchHit) -> SearchHit | None:
            if not is_google_redirect(hit.url):
                return hit
            target, reason = await self._resolve_redirect(hit.url)
            if target is None:
                logger.info("Dropping unresolvable redirect hit (%s): %r", reason, hit.title[:60])
                return None
            return replace(hit, url=target, source_domain=domain_of(target))

        resolved = await asyncio.gather(*(resolve(h) for h in hits))
        missing = next(
            (
                hit
                for hit, result in zip(hits, resolved, strict=True)
                if result is None and hit.source_domain != domain_of(hit.url)
            ),
            None,
        )
        return [h for h in resolved if h is not None], missing

    async def _resolve_redirect(self, url: str, hops: int = 3) -> tuple[str | None, str]:
        """(destination, diagnostic). Decodes `/url?q=` locally; follows up to `hops` hops."""
        current = url
        for _ in range(hops):
            decoded = decode_google_redirect(current)
            if decoded:
                return decoded, "decoded"
            try:
                response = await self._http.get(
                    current,
                    follow_redirects=False,
                    headers={"User-Agent": "Mozilla/5.0"},
                    timeout=min(self._timeout, 8.0),
                )
            except httpx.HTTPError as exc:
                return None, exc.__class__.__name__
            location = response.headers.get("location")
            if response.status_code in _REDIRECT_STATUSES and location:
                target = urljoin(current, location)
                if not is_http_url(target):
                    return None, "non-http target"
                if is_google_redirect(target):
                    current = target  # another Google hop (e.g. /goto -> /url?q=...)
                    continue
                return target, "redirect"
            if response.status_code == 200:
                target = _interstitial_target(response.text[:200_000])
                if target:
                    return target, "interstitial"
            return None, f"http {response.status_code}"
        return None, "too many google hops"

    @staticmethod
    def _parse(data: dict) -> list[SearchHit]:
        hits: list[SearchHit] = []
        for item in data.get("organic") or []:
            url = (item.get("link") or "").strip()
            title = (item.get("title") or "").strip()
            if not url or not title or not is_http_url(url):
                continue
            image = item.get("imageUrl")
            source = domain_of(url)
            if is_google_redirect(url):
                shown = str(item.get("displayedLink") or "").partition(" ")[0]
                if is_http_url(shown):
                    domain = domain_of(shown)
                    if re.fullmatch(r"[a-z0-9.-]+\.[a-z]{2,}", domain) and not domain.startswith(
                        "google."
                    ):
                        source = domain
            hits.append(
                SearchHit(
                    title=title,
                    url=url,
                    snippet=(item.get("snippet") or "").strip(),
                    source_domain=source,
                    date_text=(item.get("date") or None),
                    image_url=image if isinstance(image, str) and is_http_url(image) else None,
                    position=int(item.get("position") or len(hits) + 1),
                )
            )
        return hits


def build_search_provider(settings: Settings, http: httpx.AsyncClient) -> SearchProvider | None:
    """Return the configured provider, or None when no API key is set (no fake data)."""
    if settings.search_provider == "serper" and settings.serper_api_key:
        return SerperProvider(settings.serper_api_key, http, settings.search_timeout_seconds)
    return None
