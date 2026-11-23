"""The monitoring pipeline: real provider data only, grounded extraction, dedupe, no fake data."""

from __future__ import annotations

import json
from datetime import UTC, date, datetime, timedelta
from types import SimpleNamespace

import httpx
import pytest
import respx
from sqlalchemy import select

from app.categories import get_category
from app.container import build_container
from app.db.models import Result, Search
from app.services.llm import (
    EXTRACT_SCHEMA,
    PLANNER_SYSTEM,
    AnthropicLLM,
    ExtractedItem,
    LLMError,
    QueryPlan,
)
from app.services.normalize import (
    contact_grounded,
    date_grounded,
    normalize_url,
    price_grounded,
    url_hash,
)
from app.services.pipeline import NO_PROVIDER_MESSAGE, build_row
from app.services.search_provider import SearchProviderError, SerperProvider
from tests.conftest import insert_search, register
from tests.fakes import hit


async def _rows(sessionmaker, search_id, *, visible_only=False):
    async with sessionmaker() as session:
        query = select(Result).where(Result.search_id == search_id)
        if visible_only:
            query = query.where(Result.dismissed_at.is_(None))
        return list((await session.execute(query)).scalars())


async def _search(sessionmaker, search_id) -> Search:
    async with sessionmaker() as session:
        return await session.get(Search, search_id)


# --------------------------------------------------------------------------- unit helpers


def test_normalize_url_strips_tracking_and_variants():
    a = normalize_url("https://www.Immobiliare.it/annunci/101/?utm_source=x&gclid=1")
    b = normalize_url("http://immobiliare.it/annunci/101#photos")
    assert a == b == "https://immobiliare.it/annunci/101"
    assert normalize_url("https://x.it/p?b=2&a=1") == "https://x.it/p?a=1&b=2"
    assert url_hash("https://www.x.it/a/") == url_hash("https://x.it/a")


def test_grounding_checks():
    source = "Bilocale 450 €/mese, prezzo 120.000 €. Tel. 0924 123456, info@casa.it"
    assert price_grounded("€ 120.000", source)
    assert price_grounded("450 €/mese", source)
    assert not price_grounded("€ 99.000", source)
    assert contact_grounded("0924123456", source)
    assert contact_grounded("info@casa.it", source)
    assert not contact_grounded("+39 091 7654321", source)
    assert not contact_grounded("vendite@casa.it", source)
    assert date_grounded(date(2026, 11, 12), "scadenza 12 novembre 2026", None, posted=False)
    assert date_grounded(date(2026, 11, 12), "scade il 12/11", None, posted=False)
    assert not date_grounded(date(2026, 11, 12), "bando aperto", None, posted=False)
    assert date_grounded(date(2026, 11, 20), "", "3 giorni fa", posted=True)
    assert not date_grounded(date(2026, 3, 9), "vista mare", None, posted=False)


def test_build_row_drops_fabricated_fields():
    today = date(2026, 11, 23)
    h = hit(
        "https://www.subito.it/annuncio/1",
        "Fiat Panda 2019 a Palermo",
        "Fiat Panda 2019, 60.000 km, 7.500 €. Privato. Chiamare 333 1234567",
        "1 giorno fa",
    )
    item = ExtractedItem(
        index=0,
        relevant=True,
        summary="Panda del 2019 con 60.000 km.",
        price="€ 9.900",  # not in the source
        location="Palermo, Sicilia",  # only "Palermo" is in the source
        seller_type="privato",
        posted_date="2026-11-22",
        expiry_date="2027-01-31",  # invented
        listing_status="unknown",
        contacts=["333 1234567", "info@dealer.it", "+39 02 5555555"],
    )
    row = build_row(h, item, get_category("auto_moto"), today)
    assert row["url"] == h.url and row["title"] == h.title
    assert row["price"] is None
    assert row["location"] == "Palermo"
    assert row["seller_type"] == "Privato"
    assert row["contacts"] == ["333 1234567"]
    assert row["posted_date"] == date(2026, 11, 22)
    assert row["expiry_date"] is None
    assert row["status"] == "SCONOSCIUTO"
    assert row["dismissed_at"] is None

    grounded = build_row(
        h, ExtractedItem(index=0, relevant=True, price="7.500 €"), get_category("auto_moto"), today
    )
    assert grounded["price"] == "7.500 €"
    unknown_seller = build_row(
        h,
        ExtractedItem(index=0, relevant=True, seller_type="Broker"),
        get_category("auto_moto"),
        today,
    )
    assert unknown_seller["seller_type"] is None


def test_build_row_expiry_status_and_dismissal():
    today = date(2026, 11, 23)
    bando = hit(
        "https://www.inpa.gov.it/bando/1",
        "Concorso infermieri",
        "Scadenza domande: 15 dicembre 2026",
    )
    active = build_row(
        bando,
        ExtractedItem(index=0, relevant=True, expiry_date="2026-12-15"),
        get_category("bandi"),
        today,
    )
    assert active["status"] == "ATTIVO" and active["expiry_date"] == date(2026, 12, 15)

    old = hit("https://www.inpa.gov.it/bando/2", "Concorso scaduto", "Scadenza 1 ottobre 2026")
    expired = build_row(
        old,
        ExtractedItem(index=0, relevant=True, expiry_date="2026-10-01"),
        get_category("bandi"),
        today,
    )
    assert expired["status"] == "SCADUTO" and expired["dismiss_reason"] == "expired"

    irrelevant = build_row(
        bando, ExtractedItem(index=0, relevant=False), get_category("bandi"), today
    )
    assert irrelevant["dismiss_reason"] == "irrelevant" and irrelevant["dismissed_at"]


# --------------------------------------------------------------------------- pipeline runs


async def test_no_provider_stores_nothing(settings, engine, client, fake_llm):
    container = build_container(
        settings,
        engine=engine,
        llm=fake_llm,
        search_provider=None,
        push_sender=None,
        google_verifier=None,
        billing=None,
    )
    user = await register(client)
    sid = await insert_search(container.sessionmaker, user["user"]["id"])
    outcome = await container.pipeline.run(sid, trigger="initial")
    await container.http.aclose()

    assert outcome.status == "no_provider"
    search = await _search(container.sessionmaker, sid)
    assert search.last_run_status == "no_provider"
    assert search.last_error == NO_PROVIDER_MESSAGE
    assert search.next_run_at is not None
    assert await _rows(container.sessionmaker, sid) == []
    assert fake_llm.plan_calls == 0 and fake_llm.extract_calls == []


async def test_run_dedupes_and_only_stores_new(
    container, sessionmaker, client, fake_provider, fake_llm
):
    user = await register(client)
    sid = await insert_search(sessionmaker, user["user"]["id"])
    fake_provider.by_query = {
        fake_llm.plan.web_queries[0]: [
            hit("https://www.immobiliare.it/annunci/1/?utm_source=google", "Bilocale A"),
            hit("https://immobiliare.it/annunci/2", "Bilocale B"),
        ],
        fake_llm.plan.web_queries[1]: [
            hit("https://immobiliare.it/annunci/1", "Bilocale A (dup)"),
            hit("https://www.immobiliare.it/annunci/2/#map", "Bilocale B (dup)"),
        ],
    }
    first = await container.pipeline.run(sid, trigger="initial")
    assert first.status == "ok" and first.new_results == 2
    assert sorted(r.title for r in await _rows(sessionmaker, sid)) == ["Bilocale A", "Bilocale B"]
    assert [len(c) for c in fake_llm.extract_calls] == [2]

    # Second run: same URLs plus one new one -> only the new one is sent to the LLM and stored.
    fake_provider.by_query[fake_llm.plan.web_queries[0]].append(
        hit("https://immobiliare.it/annunci/3", "Bilocale C")
    )
    async with sessionmaker() as session:
        search = await session.get(Search, sid)
        search.next_run_at = datetime.now(UTC)
        await session.commit()
    second = await container.pipeline.run(sid, trigger="manual")
    assert second.new_results == 1
    assert [h.title for h in fake_llm.extract_calls[-1]] == ["Bilocale C"]
    assert len(await _rows(sessionmaker, sid)) == 3
    assert fake_llm.plan_calls == 1  # the plan is cached on the search


async def test_irrelevant_and_expired_hidden_but_remembered(
    container, sessionmaker, client, fake_provider, fake_llm
):
    user = await register(client)
    sid = await insert_search(sessionmaker, user["user"]["id"], category="bandi")
    fake_provider.hits = [
        hit("https://a.it/1", "Concorso OK", "Scadenza 31 dicembre 2099"),
        hit("https://a.it/2", "Pagina generica concorsi"),
        hit("https://a.it/3", "Concorso chiuso", "Scadenza 1 gennaio 2020"),
    ]
    fake_llm.extract_impl = lambda hits: [
        ExtractedItem(index=0, relevant=True, expiry_date="2099-12-31"),
        ExtractedItem(index=1, relevant=False),
        ExtractedItem(index=2, relevant=True, expiry_date="2020-01-01"),
    ]
    outcome = await container.pipeline.run(sid, trigger="initial")
    assert outcome.new_results == 1
    visible = await _rows(sessionmaker, sid, visible_only=True)
    assert [r.title for r in visible] == ["Concorso OK"]
    assert visible[0].status == "ATTIVO"
    hidden = {
        r.title: r.dismiss_reason
        for r in await _rows(sessionmaker, sid)
        if r.dismissed_at is not None
    }
    assert hidden == {"Pagina generica concorsi": "irrelevant", "Concorso chiuso": "expired"}

    async with sessionmaker() as session:
        (await session.get(Search, sid)).next_run_at = datetime.now(UTC)
        await session.commit()
    again = await container.pipeline.run(sid, trigger="manual")
    assert again.new_results == 0
    assert len(fake_llm.extract_calls) == 1  # nothing re-evaluated


async def test_unevaluated_hits_are_retried_later(
    container, sessionmaker, client, fake_provider, fake_llm
):
    user = await register(client)
    sid = await insert_search(sessionmaker, user["user"]["id"])
    fake_llm.extract_impl = lambda hits: [ExtractedItem(index=0, relevant=True)]  # skips #1
    await container.pipeline.run(sid, trigger="initial")
    assert len(await _rows(sessionmaker, sid)) == 1


async def test_plan_is_persisted(container, sessionmaker, client, fake_llm):
    user = await register(client)
    sid = await insert_search(sessionmaker, user["user"]["id"])
    await container.pipeline.run(sid, trigger="initial")
    search = await _search(sessionmaker, sid)
    assert search.summary == fake_llm.plan.summary
    assert search.filters == fake_llm.plan.filters
    assert search.keywords == fake_llm.plan.keywords
    assert search.web_queries == fake_llm.plan.web_queries
    assert search.planned_at is not None


@pytest.mark.parametrize("category", ["immobili", "bandi", "nuove_leggi"])
async def test_empty_saved_search_refreshes_queries_without_a_month_cutoff(
    container, client, sessionmaker, fake_llm, fake_provider, category
):
    user = await register(client)
    now = datetime.now(UTC)
    sid = await insert_search(
        sessionmaker,
        user["user"]["id"],
        category=category,
        planned_at=now,
        last_run_at=now,
        web_queries=["previous empty query"],
    )
    outcome = await container.pipeline.run(sid, trigger="manual")
    assert fake_llm.plan_calls == 1 and outcome.new_results == 2
    assert [c["query"] for c in fake_provider.calls] == fake_llm.plan.web_queries
    assert all(c["recency"] is None for c in fake_provider.calls)


async def test_dated_search_refreshes_bounds_even_with_existing_results(
    container, client, sessionmaker, fake_llm, fake_provider
):
    user = await register(client)
    sid = await insert_search(sessionmaker, user["user"]["id"], category="lavoro")
    first = await container.pipeline.run(sid, trigger="initial")
    assert first.new_results and all(c["recency"] == "qdr:m" for c in fake_provider.calls)
    now = datetime.now(UTC)
    async with sessionmaker() as session:
        search = await session.get(Search, sid)
        search.planned_at = now - timedelta(days=1)
        search.web_queries = ["cuoco before:2026-11-21"]
        search.next_run_at = now
        await session.commit()
    fake_llm.plan.web_queries = ["cuoco after:2026-07-22", "lavoro cuoco Palermo"]
    fake_provider.calls.clear()
    second = await container.pipeline.run(sid, trigger="manual")
    assert second.status == "ok" and second.new_results == 0
    assert fake_llm.plan_calls == 2
    assert [c["query"] for c in fake_provider.calls] == fake_llm.plan.web_queries
    assert all(c["recency"] is None for c in fake_provider.calls)


@pytest.mark.parametrize(("category", "expected_visible"), [("immobili", 0), ("lavoro", 2)])
async def test_without_llm_results_are_raw_provider_data(
    settings, engine, client, fake_provider, category, expected_visible
):
    container = build_container(
        settings,
        engine=engine,
        llm=None,
        verify_llm=None,
        search_provider=fake_provider,
        push_sender=None,
        google_verifier=None,
        billing=None,
    )
    user = await register(client)
    sid = await insert_search(
        container.sessionmaker, user["user"]["id"], query="bilocale Alcamo", category=category
    )
    outcome = await container.pipeline.run(sid, trigger="initial")
    rows = await _rows(container.sessionmaker, sid)
    await container.http.aclose()
    assert outcome.status == "ok"
    assert outcome.new_results == expected_visible
    assert [c["query"] for c in fake_provider.calls] == ["bilocale Alcamo"]
    assert {r.summary for r in rows} == {h.snippet for h in fake_provider.hits}
    assert all(r.price is None and r.contacts == [] and r.posted_date is None for r in rows)


async def test_provider_error_sets_error_status(container, sessionmaker, client, fake_provider):
    user = await register(client)
    sid = await insert_search(sessionmaker, user["user"]["id"])
    fake_provider.error = SearchProviderError("Serper rate limit or quota exceeded")
    outcome = await container.pipeline.run(sid, trigger="initial")
    assert outcome.status == "error"
    search = await _search(sessionmaker, sid)
    assert search.last_run_status == "error"
    assert search.last_error == "Serper rate limit or quota exceeded"
    delay = search.next_run_at - datetime.now(UTC)
    assert timedelta(minutes=25) < delay <= timedelta(minutes=30)
    assert await _rows(sessionmaker, sid) == []


async def test_llm_error_stores_nothing(container, sessionmaker, client, fake_llm):
    user = await register(client)
    sid = await insert_search(
        sessionmaker, user["user"]["id"], planned_at=datetime.now(UTC), web_queries=["q"]
    )
    fake_llm.error = LLMError("LLM rate limited", retryable=True)
    outcome = await container.pipeline.run(sid, trigger="initial")
    assert outcome.status == "error"
    assert (await _search(sessionmaker, sid)).last_error == "LLM rate limited"
    assert await _rows(sessionmaker, sid) == []


async def test_deleted_search_mid_run_is_harmless(container, sessionmaker, client, fake_llm):
    user = await register(client)
    sid = await insert_search(sessionmaker, user["user"]["id"])

    extract_impl = fake_llm.extract_impl

    async def extract(**kwargs):
        # The user deletes the search while the LLM call is in flight.
        async with sessionmaker() as session:
            await session.delete(await session.get(Search, sid))
            await session.commit()
        return extract_impl(kwargs["hits"])

    fake_llm.extract = extract  # type: ignore[method-assign]
    outcome = await container.pipeline.run(sid, trigger="initial")
    assert outcome.status == "ok" and outcome.new_results == 0


# --------------------------------------------------------------------------- Serper client


@respx.mock
async def test_serper_provider_request_and_parsing():
    route = respx.post("https://google.serper.dev/search").mock(
        return_value=httpx.Response(
            200,
            json={
                "organic": [
                    {
                        "title": "Bilocale Alcamo",
                        "link": "https://www.immobiliare.it/annunci/9/",
                        "snippet": "450 €/mese",
                        "date": "2 giorni fa",
                        "position": 1,
                    },
                    {"title": "No link"},
                    {"title": "Bad scheme", "link": "javascript:alert(1)"},
                ]
            },
        )
    )
    async with httpx.AsyncClient() as http:
        provider = SerperProvider("serper-key", http)
        hits = await provider.search(
            "bilocale Alcamo", language="it", country="it", num=10, recency="qdr:m"
        )
    request = route.calls.last.request
    assert request.headers["X-API-KEY"] == "serper-key"
    assert json.loads(request.content) == {
        "q": "bilocale Alcamo",
        "hl": "it",
        "num": 10,
        "gl": "it",
        "tbs": "qdr:m",
    }
    assert len(hits) == 1
    assert hits[0].source_domain == "immobiliare.it"
    assert hits[0].date_text == "2 giorni fa"


@respx.mock
async def test_serper_errors():
    respx.post("https://google.serper.dev/search").mock(return_value=httpx.Response(403))
    async with httpx.AsyncClient() as http:
        with pytest.raises(SearchProviderError) as info:
            await SerperProvider("bad", http).search(
                "q", language="it", country=None, num=5, recency=None
            )
    assert info.value.retryable is False


# --------------------------------------------------------------------------- Anthropic client


class _FakeMessages:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        return self.responses.pop(0)


def _response(payload, stop_reason="end_turn"):
    return SimpleNamespace(
        stop_reason=stop_reason,
        content=[
            SimpleNamespace(type="thinking", thinking=""),
            SimpleNamespace(type="text", text=json.dumps(payload)),
        ],
        usage=SimpleNamespace(
            input_tokens=10,
            output_tokens=5,
            cache_read_input_tokens=0,
            cache_creation_input_tokens=0,
        ),
    )


def _anthropic(responses):
    messages = _FakeMessages(responses)
    client = SimpleNamespace(messages=messages, close=None)
    return AnthropicLLM(client, model="claude-haiku-5-5", effort="low"), messages  # type: ignore[arg-type]


async def test_anthropic_plan_request_shape():
    llm, messages = _anthropic(
        [
            _response(
                {
                    "summary": "Bilocali ad Alcamo",
                    "keywords": ["bilocale", "Bilocale", "alcamo"],
                    "filters": [{"name": "Max Price", "value": "500"}],
                    "search_queries": ["q1", "q2", "q3", "q4"],
                }
            )
        ]
    )
    plan = await llm.plan_search(
        query="bilocale Alcamo",
        category=get_category("immobili"),
        language="it",
        today=date(2026, 11, 23),
    )
    assert plan.keywords == ["bilocale", "alcamo"]
    assert plan.filters == {"max_price": "500"}
    assert plan.web_queries == ["q1", "q2", "q3"]

    call = messages.calls[0]
    assert call["model"] == "claude-haiku-5-5"
    assert call["output_config"]["effort"] == "low"
    assert call["output_config"]["format"]["type"] == "json_schema"
    assert call["system"][0]["text"] == PLANNER_SYSTEM
    assert call["system"][0]["cache_control"] == {"type": "ephemeral"}
    assert "2026-11-23" in call["messages"][0]["content"]
    assert "2026-11-23" not in PLANNER_SYSTEM  # volatile data stays out of the cached prefix
    for forbidden in ("temperature", "top_p", "top_k"):
        assert forbidden not in call


async def test_anthropic_extract_and_failures():
    item = {
        "index": 0,
        "relevant": True,
        "relevance_reason": "ok",
        "summary": "ok",
        "price": None,
        "location": None,
        "seller_type": None,
        "posted_date": None,
        "expiry_date": None,
        "listing_status": "unknown",
        "contacts": [],
    }
    llm, messages = _anthropic(
        [
            _response({"items": [item, {**item, "index": 7}]}),
            _response({"items": []}, stop_reason="refusal"),
            _response({"items": []}, stop_reason="max_tokens"),
        ]
    )
    kwargs = {
        "query": "q",
        "category": get_category("immobili"),
        "language": "it",
        "plan": QueryPlan(summary=None),
        "hits": [hit("https://a.it/1", "A")],
        "today": date(2026, 11, 23),
    }
    items = await llm.extract(**kwargs)
    assert [i.index for i in items] == [0]  # out-of-range indexes are discarded
    assert messages.calls[0]["output_config"]["format"]["schema"] == EXTRACT_SCHEMA
    with pytest.raises(LLMError):
        await llm.extract(**kwargs)
    with pytest.raises(LLMError):
        await llm.extract(**kwargs)


def test_schemas_are_strict():
    def walk(node):
        if isinstance(node, dict):
            if node.get("type") == "object":
                assert node.get("additionalProperties") is False
                assert set(node["required"]) == set(node["properties"])
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for value in node:
                walk(value)

    walk(EXTRACT_SCHEMA)


@respx.mock
async def test_serper_unwraps_google_redirect_links():
    wrapped = "https://www.google.com/goto?url=CAESabc&gsessionid=xyz"
    dead = "https://www.google.com/goto?url=CAESdead&gsessionid=xyz"
    broken = "https://www.google.com/url?q=broken"
    respx.post("https://google.serper.dev/search").mock(
        return_value=httpx.Response(
            200,
            json={
                "organic": [
                    {"title": "Bilocale Navigli", "link": wrapped, "snippet": "1.200 €"},
                    {"title": "Gone", "link": dead, "snippet": ""},
                    {"title": "Error", "link": broken, "snippet": ""},
                    {"title": "Direct", "link": "https://www.casa.it/annuncio/1", "snippet": ""},
                ]
            },
        )
    )
    redirect = respx.get(wrapped).mock(
        return_value=httpx.Response(302, headers={"Location": "https://www.pcase.it/annuncio_1/"})
    )
    respx.get(dead).mock(return_value=httpx.Response(200, text="no redirect"))
    respx.get(broken).mock(side_effect=httpx.ConnectTimeout("timeout"))
    async with httpx.AsyncClient() as http:
        hits = await SerperProvider("k", http).search(
            "q", language="it", country="it", num=10, recency=None
        )
    assert [(h.title, h.url, h.source_domain) for h in hits] == [
        ("Bilocale Navigli", "https://www.pcase.it/annuncio_1/", "pcase.it"),
        ("Direct", "https://www.casa.it/annuncio/1", "casa.it"),
    ]
    assert redirect.calls.last.request.headers.get("user-agent") == "Mozilla/5.0"


@respx.mock
async def test_provider_recovers_direct_source_pages_after_a_validation_screen():
    wrapper = "https://www.google.com/goto?url=opaque"
    source = "https://www.pcase.it/immobili/alcamo/"
    item = {
        "title": "Bilocale Alcamo via ...",
        "snippet": "Bilocale Alcamo via Roma · 650 euro",
        "link": wrapper,
        "displayedLink": "https://www.pcase.it › immobili",
    }
    route = respx.post(SerperProvider.endpoint).mock(
        side_effect=[
            httpx.Response(200, json={"organic": [item, item]}),
            httpx.Response(
                200,
                json={
                    "organic": [
                        {"title": "Bilocale in via Roma", "link": source, "snippet": "650 euro"},
                        {"title": "Wrong source", "link": "https://other.it/result"},
                        item,
                    ]
                },
            ),
        ]
    )
    respx.get(wrapper).mock(return_value=httpx.Response(200, text="Validation in progress"))
    async with httpx.AsyncClient() as http:
        hits = await SerperProvider("k", http).search(
            "affitto", language="it", country="it", num=10, recency=None
        )
    assert [(h.url, h.snippet) for h in hits] == [(source, "650 euro")]
    assert route.call_count == 2
    assert (
        json.loads(route.calls.last.request.content)["q"]
        == "site:pcase.it Bilocale Alcamo via Roma"
    )


def test_google_redirect_detection_and_session_param():
    from app.services.search_provider import is_google_redirect

    assert is_google_redirect("https://www.google.com/goto?url=x")
    assert is_google_redirect("https://google.it/url?q=https://a.it")
    assert not is_google_redirect("https://www.google.com/maps/place/x")
    assert not is_google_redirect("https://www.immobiliare.it/goto")
    assert normalize_url("https://a.it/x?gsessionid=1&id=2") == "https://a.it/x?id=2"


# --------------------------------------------------------------------------- relevance policy


def test_extractor_prompt_separates_literal_fields_from_relevance():
    from app.services.llm import EXTRACTOR_SYSTEM

    fields, relevance = EXTRACTOR_SYSTEM.split("RELEVANCE.", 1)
    assert "ONLY information literally present" in fields
    assert "MAY use general knowledge" in relevance
    assert "When uncertain, keep the result" in relevance
    assert "missing price is never a reason to reject" in relevance
    assert "above the requested maximum (no tolerance)" in relevance
    assert "sale instead of rent" in relevance
    assert "lists of search results" in relevance
    assert "spam" in relevance


def test_extraction_field_order_puts_reason_before_decision():
    from app.services.llm import ExtractItemOutput

    for order in (
        list(ExtractItemOutput.model_fields),
        list(EXTRACT_SCHEMA["properties"]["items"]["items"]["properties"]),
    ):
        assert order[-2:] == ["relevance_reason", "relevant"]
        assert order.index("price") < order.index("relevance_reason")


async def test_relevance_may_use_knowledge_but_fields_stay_literal(
    container, sessionmaker, client, fake_provider, fake_llm, caplog
):
    user = await register(client)
    sid = await insert_search(sessionmaker, user["user"]["id"])
    fake_provider.hits = [
        hit(
            "https://www.pcase.it/annuncio_1/",
            "Bilocale in affitto viale Coni Zugna",
            "Appartamento bilocale 50 mq, 1.200 € al mese",
        ),
        hit(
            "https://www.casa.it/affitto/milano/",
            "Appartamenti in affitto a Milano",
            "1.234 annunci di appartamenti in affitto",
        ),
    ]
    fake_llm.extract_impl = lambda hits: [
        ExtractedItem(
            index=0,
            relevant=True,
            price="1.200 €",
            location="Navigli",
            relevance_reason="Viale Coni Zugna is in the Navigli area.",
        ),
        ExtractedItem(index=1, relevant=False, relevance_reason="Generic list of search results."),
    ]
    with caplog.at_level("INFO", logger="app.services.pipeline"):
        outcome = await container.pipeline.run(sid, trigger="initial")
    assert outcome.new_results == 1
    visible = await _rows(sessionmaker, sid, visible_only=True)
    assert [r.url for r in visible] == ["https://www.pcase.it/annuncio_1/"]
    assert visible[0].price == "1.200 €"
    assert visible[0].location is None  # "Navigli" is not literally in the source text
    dismissed = [r.message for r in caplog.records if "hit dismissed" in r.message]
    assert len(dismissed) == 1
    assert "reason=irrelevant" in dismissed[0] and "Generic list" in dismissed[0]


@respx.mock
async def test_serper_google_redirect_chains_and_interstitials(caplog):
    goto_chain = "https://www.google.com/goto?url=CAESchain"
    url_link = "https://www.google.com/url?q=https://www.pcase.it/annuncio_9/&sa=U"
    goto_notice = "https://www.google.com/goto?url=CAESnotice"
    goto_dead = "https://www.google.com/goto?url=CAESdead"
    respx.post("https://google.serper.dev/search").mock(
        return_value=httpx.Response(
            200,
            json={
                "organic": [
                    {"title": "Chain", "link": goto_chain},
                    {"title": "Direct url link", "link": url_link},
                    {"title": "Notice", "link": goto_notice},
                    {"title": "Dead", "link": goto_dead},
                ]
            },
        )
    )
    respx.get(goto_chain).mock(
        return_value=httpx.Response(
            302,
            headers={"Location": "/url?q=https://www.casa.it/annuncio/5/&sa=U&ved=x"},
        )
    )
    url_route = respx.get(url__startswith="https://www.google.com/url").mock(
        return_value=httpx.Response(500)
    )
    respx.get(goto_notice).mock(
        return_value=httpx.Response(
            200,
            text='<html><a href="https://www.google.com/">Google</a> Redirect notice: '
            '<a href="https://www.immobiliare.it/annunci/7/?a=1&amp;b=2">continue</a></html>',
        )
    )
    respx.get(goto_dead).mock(return_value=httpx.Response(429))
    with caplog.at_level("INFO", logger="app.services.search_provider"):
        async with httpx.AsyncClient() as http:
            hits = await SerperProvider("k", http).search(
                "q", language="it", country="it", num=10, recency=None
            )
    assert [(h.title, h.url) for h in hits] == [
        ("Chain", "https://www.casa.it/annuncio/5/"),
        ("Direct url link", "https://www.pcase.it/annuncio_9/"),
        ("Notice", "https://www.immobiliare.it/annunci/7/?a=1&b=2"),
    ]
    assert not url_route.called  # /url?q= targets are decoded locally
    dropped = [r.message for r in caplog.records if "Dropping unresolvable" in r.message]
    assert dropped == ["Dropping unresolvable redirect hit (http 429): 'Dead'"]
