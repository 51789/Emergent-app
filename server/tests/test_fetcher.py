"""HttpPageFetcher: robots.txt, limits, SSRF guard, walled sites, text extraction (respx)."""

from __future__ import annotations

import asyncio

import httpx
import pytest
import respx

from app.services.fetcher import HttpPageFetcher, extract_main_text

LISTING_HTML = """<html><head><title>Bilocale Navigli - 1.200 €</title>
<script>document.write('tracking')</script></head><body>
<nav>Home | Affitto | Vendita | Accedi</nav>
<main><h1>Bilocale in affitto, viale Coni Zugna, Milano</h1>
<p>Prezzo: 1.200 € al mese. Appartamento di 50 mq al secondo piano con balcone,
cucina abitabile e camera matrimoniale. Disponibile da subito, contratto 4+4.</p>
<p>Zona Navigli / Porta Genova, vicino alla metropolitana M2. Riscaldamento autonomo.</p>
<p>Contatti: 02 1234567</p></main><footer>Copyright</footer></body></html>"""


async def public_dns(host: str) -> list[str]:
    return ["93.184.216.34"]


async def private_dns(host: str) -> list[str]:
    return ["127.0.0.1"]


def _fetcher(http: httpx.AsyncClient, **kwargs) -> HttpPageFetcher:
    kwargs.setdefault("resolver", public_dns)
    return HttpPageFetcher(http, **kwargs)


def _html(body: str = LISTING_HTML, status: int = 200) -> httpx.Response:
    return httpx.Response(status, text=body, headers={"Content-Type": "text/html; charset=utf-8"})


@respx.mock
async def test_fetch_success_extracts_main_text():
    respx.get("https://www.pcase.it/robots.txt").mock(
        return_value=httpx.Response(200, text="User-agent: *\nDisallow: /admin\n")
    )
    page_route = respx.get("https://www.pcase.it/annuncio/1").mock(return_value=_html())
    async with httpx.AsyncClient() as http:
        page = await _fetcher(http).fetch("https://www.pcase.it/annuncio/1")
    assert page.status == "ok" and page.http_status == 200
    assert page.title == "Bilocale Navigli - 1.200 €"
    assert "Prezzo: 1.200 € al mese" in page.text
    assert "tracking" not in page.text  # scripts are never executed or kept
    assert page_route.calls.last.request.headers["user-agent"] == "ConsulensBot/1.0"


@respx.mock
@pytest.mark.parametrize(
    ("status", "expected"),
    [(403, "blocked"), (429, "blocked"), (404, "not_found"), (410, "not_found"), (500, "error")],
)
async def test_fetch_http_status_mapping(status, expected):
    respx.get("https://site.it/robots.txt").mock(return_value=httpx.Response(404))
    respx.get("https://site.it/a").mock(return_value=_html("gone", status))
    async with httpx.AsyncClient() as http:
        page = await _fetcher(http).fetch("https://site.it/a")
    assert page.status == expected


@respx.mock
async def test_robots_disallow_is_respected_and_cached():
    robots = respx.get("https://agenzia.it/robots.txt").mock(
        return_value=httpx.Response(
            200, text="User-agent: ConsulensBot\nDisallow: /annunci/\n\nUser-agent: *\nAllow: /\n"
        )
    )
    blocked = respx.get("https://agenzia.it/annunci/9").mock(return_value=_html())
    allowed = respx.get("https://agenzia.it/chi-siamo").mock(return_value=_html())
    async with httpx.AsyncClient() as http:
        fetcher = _fetcher(http)
        first = await fetcher.fetch("https://agenzia.it/annunci/9")
        second = await fetcher.fetch("https://agenzia.it/chi-siamo")
    assert first.status == "robots_disallowed"
    assert not blocked.called
    assert second.status == "ok" and allowed.called
    assert robots.call_count == 1  # cached per host


@respx.mock
@pytest.mark.parametrize(("robots_status", "expected"), [(404, "ok"), (503, "robots_disallowed")])
async def test_robots_unavailable_semantics(robots_status, expected):
    respx.get("https://x.it/robots.txt").mock(return_value=httpx.Response(robots_status))
    respx.get("https://x.it/p").mock(return_value=_html())
    async with httpx.AsyncClient() as http:
        page = await _fetcher(http).fetch("https://x.it/p")
    assert page.status == expected


@respx.mock
async def test_walled_sites_are_not_fetched():
    route = respx.get(url__startswith="https://www.facebook.com/").mock(return_value=_html())
    async with httpx.AsyncClient() as http:
        page = await _fetcher(http).fetch("https://www.facebook.com/groups/1/posts/2/")
    assert page.status == "blocked" and page.detail == "login wall"
    assert not route.called


@respx.mock
async def test_ssrf_private_addresses_are_refused():
    route = respx.get(url__startswith="https://intranet.example/").mock(return_value=_html())
    async with httpx.AsyncClient() as http:
        page = await _fetcher(http, resolver=private_dns).fetch("https://intranet.example/x")
    assert page.status == "blocked" and "non-public" in (page.detail or "")
    assert not route.called


@respx.mock
async def test_ssrf_redirect_to_private_host_is_refused():
    respx.get("https://public.it/robots.txt").mock(return_value=httpx.Response(404))
    respx.get("https://public.it/go").mock(
        return_value=httpx.Response(302, headers={"Location": "http://internal.local/admin"})
    )
    internal = respx.get(url__startswith="http://internal.local/").mock(return_value=_html())

    async def dns(host: str) -> list[str]:
        return ["10.0.0.5"] if host == "internal.local" else ["93.184.216.34"]

    async with httpx.AsyncClient() as http:
        page = await _fetcher(http, resolver=dns).fetch("https://public.it/go")
    assert page.status == "blocked"
    assert not internal.called


@respx.mock
async def test_non_default_ports_and_schemes_are_refused():
    async with httpx.AsyncClient() as http:
        fetcher = _fetcher(http)
        assert (await fetcher.fetch("https://site.it:8443/a")).status == "blocked"
        assert (await fetcher.fetch("ftp://site.it/a")).status == "blocked"


@respx.mock
async def test_size_limit_content_type_and_thin_pages():
    respx.get("https://big.it/robots.txt").mock(return_value=httpx.Response(404))
    huge = "<html><body><main>" + ("<p>Bilocale luminoso in affitto.</p>" * 50_000) + "</main>"
    respx.get("https://big.it/huge").mock(return_value=_html(huge))
    respx.get("https://big.it/file.pdf").mock(
        return_value=httpx.Response(
            200, content=b"%PDF", headers={"Content-Type": "application/pdf"}
        )
    )
    respx.get("https://big.it/thin").mock(return_value=_html("<html><body>Loading…</body></html>"))
    async with httpx.AsyncClient() as http:
        fetcher = _fetcher(http, max_bytes=50_000, max_chars=5_000)
        huge_page = await fetcher.fetch("https://big.it/huge")
        pdf = await fetcher.fetch("https://big.it/file.pdf")
        thin = await fetcher.fetch("https://big.it/thin")
    assert huge_page.status == "ok" and len(huge_page.text) <= 5_000
    assert pdf.status == "unreadable"
    assert thin.status == "unreadable" and thin.detail == "too little text"


@respx.mock
async def test_per_domain_concurrency_is_bounded():
    active = {"now": 0, "max": 0}

    async def slow(request: httpx.Request) -> httpx.Response:
        active["now"] += 1
        active["max"] = max(active["max"], active["now"])
        await asyncio.sleep(0.05)
        active["now"] -= 1
        return _html()

    respx.get("https://busy.it/robots.txt").mock(return_value=httpx.Response(404))
    respx.get(url__regex=r"https://busy\.it/a/\d+").mock(side_effect=slow)
    async with httpx.AsyncClient() as http:
        fetcher = _fetcher(http, per_domain=2, concurrency=10)
        pages = await asyncio.gather(*(fetcher.fetch(f"https://busy.it/a/{i}") for i in range(6)))
    assert all(p.status == "ok" for p in pages)
    assert active["max"] == 2


def test_extract_main_text_fallback_and_title_unescape():
    title, text = extract_main_text(
        "<html><head><title>Casa &amp; Co</title></head><body>" + "<span>x</span>" * 3 + "</body>"
    )
    assert title == "Casa & Co"
    assert isinstance(text, str)
