"""Polite page fetching for result verification.

- Identifies itself as `ConsulensBot/1.0` (no personal data) and honours robots.txt
  (cached per scheme+host; RFC 9309: 4xx = allow all, 5xx/unreachable = disallow all).
- Bounded: per-request timeout, at most `max_bytes` read, redirects followed manually (max 5),
  global concurrency and per-domain concurrency limits. JavaScript is never executed.
- SSRF guard: every hop must be http(s) on a default port and resolve only to public IPs.
- Sites that always show a login wall (Facebook, Instagram, X...) are not fetched.
- The HTML is reduced to readable main text with trafilatura and truncated to `max_chars`.
  The text is untrusted content: callers must treat it as data, never as instructions.
"""

from __future__ import annotations

import asyncio
import html as html_lib
import ipaddress
import logging
import re
import socket
import time
import warnings
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Literal, Protocol
from urllib.parse import urljoin, urlsplit
from urllib.robotparser import RobotFileParser

import httpx
from anyio import to_thread

logger = logging.getLogger(__name__)

FetchStatus = Literal["ok", "not_found", "blocked", "robots_disallowed", "error", "unreadable"]
Resolver = Callable[[str], Awaitable[list[str]]]

WALLED_DOMAINS: tuple[str, ...] = (
    "facebook.com",
    "instagram.com",
    "x.com",
    "twitter.com",
    "tiktok.com",
    "threads.net",
)
MIN_TEXT_CHARS = 200
_REDIRECTS = {301, 302, 303, 307, 308}
_BLOCKED = {401, 402, 403, 407, 429, 451}
_TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.IGNORECASE | re.DOTALL)


@dataclass(frozen=True)
class FetchedPage:
    status: FetchStatus
    url: str  # final URL after redirects
    http_status: int | None = None
    title: str | None = None
    text: str = ""
    detail: str | None = None


class PageFetcher(Protocol):
    async def fetch(self, url: str) -> FetchedPage: ...


async def default_resolver(host: str) -> list[str]:
    loop = asyncio.get_running_loop()
    infos = await loop.getaddrinfo(host, None, type=socket.SOCK_STREAM)
    return [str(info[4][0]) for info in infos]


def _is_public(address: str) -> bool:
    try:
        return ipaddress.ip_address(address.split("%", 1)[0]).is_global
    except ValueError:
        return False


def _domain_key(host: str) -> str:
    host = host.lower().rstrip(".")
    return host[4:] if host.startswith("www.") else host


def _is_walled(host: str) -> bool:
    key = _domain_key(host)
    return any(key == d or key.endswith("." + d) for d in WALLED_DOMAINS)


def extract_main_text(html: str, url: str | None = None) -> tuple[str | None, str]:
    """(page title, readable main text). Never executes scripts."""
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        import trafilatura

    match = _TITLE_RE.search(html)
    title = " ".join(html_lib.unescape(match.group(1)).split())[:300] if match else None
    text = (
        trafilatura.extract(
            html,
            url=url,
            favor_recall=True,
            include_tables=True,
            include_comments=False,
            include_links=False,
            include_images=False,
            deduplicate=True,
        )
        or ""
    )
    if len(text) < MIN_TEXT_CHARS:
        fallback = trafilatura.html2txt(html) or ""
        if len(fallback) > len(text):
            text = fallback
    text = re.sub(r"[ \t\r\f\v]+", " ", text)
    text = re.sub(r"\n\s*\n+", "\n", text).strip()
    return title or None, text


@dataclass
class _RobotsEntry:
    expires_at: float
    parser: RobotFileParser | None  # None means "use `allow_all`"
    allow_all: bool

    def allows(self, agent: str, url: str) -> bool:
        if self.parser is None:
            return self.allow_all
        return self.parser.can_fetch(agent, url)


class HttpPageFetcher:
    def __init__(
        self,
        http: httpx.AsyncClient,
        *,
        user_agent: str = "ConsulensBot/1.0",
        timeout: float = 10.0,
        max_bytes: int = 2_000_000,
        max_chars: int = 24_000,
        concurrency: int = 6,
        per_domain: int = 2,
        robots_ttl: int = 3600,
        resolver: Resolver = default_resolver,
        max_redirects: int = 5,
    ) -> None:
        self._http = http
        self._user_agent = user_agent
        self._agent_token = user_agent.split("/", 1)[0]
        self._timeout = timeout
        self._max_bytes = max_bytes
        self._max_chars = max_chars
        self._global = asyncio.Semaphore(max(1, concurrency))
        self._per_domain = max(1, per_domain)
        self._domain_sems: dict[str, asyncio.Semaphore] = {}
        self._robots: dict[str, _RobotsEntry] = {}
        self._robots_locks: dict[str, asyncio.Lock] = {}
        self._robots_ttl = robots_ttl
        self._resolver = resolver
        self._max_redirects = max_redirects

    @property
    def _headers(self) -> dict[str, str]:
        return {
            "User-Agent": self._user_agent,
            "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
            "Accept-Language": "it-IT,it;q=0.9,en;q=0.5",
        }

    async def fetch(self, url: str) -> FetchedPage:
        host = urlsplit(url).hostname or ""
        if _is_walled(host):
            return FetchedPage("blocked", url, detail="login wall")
        key = _domain_key(host)
        sem = self._domain_sems.setdefault(key, asyncio.Semaphore(self._per_domain))
        async with self._global, sem:
            return await self._fetch(url)

    async def _host_ok(self, url: str) -> bool:
        parts = urlsplit(url)
        if parts.scheme not in ("http", "https") or not parts.hostname:
            return False
        if parts.port not in (None, 80, 443) or parts.username or parts.password:
            return False
        try:
            addresses = await self._resolver(parts.hostname)
        except (OSError, UnicodeError):
            return False
        return bool(addresses) and all(_is_public(a) for a in addresses)

    async def _fetch(self, url: str) -> FetchedPage:
        current = url
        for _ in range(self._max_redirects + 1):
            if not await self._host_ok(current):
                return FetchedPage("blocked", current, detail="non-public or invalid address")
            if not await self._robots_allowed(current):
                return FetchedPage("robots_disallowed", current)
            try:
                async with self._http.stream(
                    "GET",
                    current,
                    headers=self._headers,
                    timeout=self._timeout,
                    follow_redirects=False,
                ) as response:
                    status = response.status_code
                    location = response.headers.get("location")
                    if status in _REDIRECTS and location:
                        current = urljoin(current, location)
                        continue
                    if status in (404, 410):
                        return FetchedPage("not_found", current, status)
                    if status in _BLOCKED:
                        return FetchedPage("blocked", current, status)
                    if status >= 400:
                        return FetchedPage("error", current, status)
                    ctype = response.headers.get("content-type", "").lower()
                    if ctype and "html" not in ctype and "xml" not in ctype:
                        return FetchedPage("unreadable", current, status, detail=ctype[:60])
                    body = await self._read_limited(response)
                    encoding = response.charset_encoding or "utf-8"
            except httpx.HTTPError as exc:
                return FetchedPage("error", current, detail=exc.__class__.__name__)
            try:
                html = body.decode(encoding, errors="replace")
            except LookupError:
                html = body.decode("utf-8", errors="replace")
            title, text = await to_thread.run_sync(extract_main_text, html, current)
            text = text[: self._max_chars]
            if len(text) < MIN_TEXT_CHARS:
                return FetchedPage("unreadable", current, status, title, text, "too little text")
            return FetchedPage("ok", current, status, title, text)
        return FetchedPage("error", current, detail="too many redirects")

    async def _read_limited(self, response: httpx.Response) -> bytes:
        chunks: list[bytes] = []
        total = 0
        async for chunk in response.aiter_bytes():
            chunks.append(chunk)
            total += len(chunk)
            if total >= self._max_bytes:
                break
        return b"".join(chunks)[: self._max_bytes]

    # ------------------------------------------------------------------ robots.txt

    async def _robots_allowed(self, url: str) -> bool:
        parts = urlsplit(url)
        origin = f"{parts.scheme}://{parts.netloc}".lower()
        entry = self._robots.get(origin)
        if entry is None or entry.expires_at < time.monotonic():
            lock = self._robots_locks.setdefault(origin, asyncio.Lock())
            async with lock:
                entry = self._robots.get(origin)
                if entry is None or entry.expires_at < time.monotonic():
                    entry = await self._load_robots(origin)
                    self._robots[origin] = entry
        return entry.allows(self._agent_token, url)

    async def _load_robots(self, origin: str) -> _RobotsEntry:
        now = time.monotonic()
        unreachable = _RobotsEntry(now + 600, None, allow_all=False)  # disallow, retry sooner
        url = f"{origin}/robots.txt"
        response: httpx.Response | None = None
        for _ in range(self._max_redirects + 1):
            if not await self._host_ok(url):
                return unreachable
            try:
                response = await self._http.get(
                    url,
                    headers={"User-Agent": self._user_agent},
                    timeout=min(self._timeout, 5.0),
                    follow_redirects=False,
                )
            except httpx.HTTPError:
                return unreachable
            location = response.headers.get("location")
            if response.status_code in _REDIRECTS and location:
                url = urljoin(url, location)
                continue
            break
        if response is None or response.status_code in _REDIRECTS:
            return unreachable
        if response.status_code >= 500 or response.status_code == 429:
            return _RobotsEntry(now + 600, None, allow_all=False)
        if response.status_code >= 400:
            return _RobotsEntry(now + self._robots_ttl, None, allow_all=True)
        parser = RobotFileParser()
        parser.parse(response.text[:500_000].splitlines())
        return _RobotsEntry(now + self._robots_ttl, parser, allow_all=True)
