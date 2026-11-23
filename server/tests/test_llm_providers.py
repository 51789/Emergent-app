"""LLM provider selection, the OpenAI adapter (client mocked) and env-file precedence."""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import httpx
import httpx2
import openai
import pytest
from openai.lib._parsing._responses import type_to_text_format_param
from pydantic import ValidationError
from sqlalchemy import select

from app.categories import get_category
from app.container import build_container
from app.core import config as config_module
from app.core.config import ENV_FILES, REPO_ROOT, SERVER_DIR, Settings
from app.db.models import Result
from app.main import create_app
from app.services.llm import (
    EXTRACT_SCHEMA,
    EXTRACTOR_SYSTEM,
    PLAN_SCHEMA,
    PLANNER_SYSTEM,
    AnthropicLLM,
    ExtractItemOutput,
    ExtractOutput,
    FilterOutput,
    LLMError,
    OpenAILLM,
    PlanOutput,
    QueryPlan,
    build_llm,
)
from tests.conftest import insert_search, register
from tests.fakes import hit

LLM_ENV_VARS = (
    "LLM_PROVIDER",
    "LLM_MODEL",
    "LLM_EFFORT",
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "SERPER_API_KEY",
)
_REQUEST = httpx2.Request("POST", "https://api.openai.com/v1/responses")


@pytest.fixture(autouse=True)
def _clean_llm_env(monkeypatch):
    for name in LLM_ENV_VARS:
        monkeypatch.delenv(name, raising=False)


def _settings(**values: Any) -> Settings:
    return Settings(_env_file=None, jwt_secret="j" * 40, **values)  # type: ignore[call-arg]


# --------------------------------------------------------------------------- fake OpenAI


class _FakeResponses:
    def __init__(self, results: list[Any]) -> None:
        self.results = list(results)
        self.calls: list[dict[str, Any]] = []

    async def parse(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)
        result = self.results.pop(0)
        if isinstance(result, BaseException):
            raise result
        return result


def _openai(results: list[Any], effort: str | None = "low") -> tuple[OpenAILLM, _FakeResponses]:
    responses = _FakeResponses(results)

    async def close() -> None:
        return None

    client = SimpleNamespace(responses=responses, close=close)
    return OpenAILLM(client, model="gpt-6.2-sol", effort=effort), responses  # type: ignore[arg-type]


def _response(
    parsed: Any, *, status: str = "completed", reason: str | None = None, refusal: bool = False
) -> SimpleNamespace:
    if refusal:
        content = [SimpleNamespace(type="refusal", refusal="I can't help with that.")]
    else:
        content = [
            SimpleNamespace(type="output_text", text=parsed.model_dump_json(), parsed=parsed)
        ]
    return SimpleNamespace(
        status=status,
        incomplete_details=SimpleNamespace(reason=reason) if reason else None,
        output=[
            SimpleNamespace(type="reasoning", content=None),
            SimpleNamespace(type="message", content=content),
        ],
        output_parsed=None if refusal else parsed,
        usage=SimpleNamespace(
            input_tokens=1200,
            input_tokens_details=SimpleNamespace(cached_tokens=1024),
            output_tokens=300,
            output_tokens_details=SimpleNamespace(reasoning_tokens=120),
        ),
    )


PLAN = PlanOutput(
    summary="Bilocali in affitto ai Navigli",
    keywords=["bilocale", "Bilocale", "navigli"],
    filters=[FilterOutput(name="Max Price", value="1200")],
    search_queries=["q1", "q2", "q3", "q4"],
)


def _item(index: int, **overrides: Any) -> ExtractItemOutput:
    values: dict[str, Any] = {
        "index": index,
        "relevant": True,
        "relevance_reason": "Matches the request.",
        "summary": "ok",
        "price": None,
        "location": None,
        "seller_type": None,
        "posted_date": None,
        "expiry_date": None,
        "listing_status": "unknown",
        "contacts": [],
    }
    values.update(overrides)
    return ExtractItemOutput(**values)


EXTRACT_KWARGS: dict[str, Any] = {
    "query": "bilocale Navigli",
    "category": get_category("immobili"),
    "language": "it",
    "plan": QueryPlan(summary=None, filters={"max_price": "1200"}),
    "hits": [hit("https://www.immobiliare.it/annunci/1/", "Bilocale Navigli")],
    "today": date(2026, 11, 23),
}


# --------------------------------------------------------------------------- OpenAI adapter


async def test_openai_plan_request_and_parsing():
    llm, responses = _openai([_response(PLAN)])
    plan = await llm.plan_search(
        query="bilocale Navigli",
        category=get_category("immobili"),
        language="it",
        today=date(2026, 11, 23),
    )
    assert plan.summary == "Bilocali in affitto ai Navigli"
    assert plan.keywords == ["bilocale", "navigli"]
    assert plan.filters == {"max_price": "1200"}
    assert plan.web_queries == ["q1", "q2", "q3"]

    call = responses.calls[0]
    assert call["model"] == "gpt-6.2-sol"
    assert call["text_format"] is PlanOutput
    assert call["reasoning"] == {"effort": "low"}
    assert call["max_output_tokens"] >= 8000
    assert call["store"] is False
    assert call["input"][0] == {"role": "developer", "content": PLANNER_SYSTEM}
    assert call["input"][1]["role"] == "user"
    assert "2026-11-23" in call["input"][1]["content"]
    for forbidden in ("temperature", "top_p"):
        assert forbidden not in call


async def test_openai_extract_discards_out_of_range_items():
    llm, responses = _openai([_response(ExtractOutput(items=[_item(0), _item(5)]))])
    items = await llm.extract(**EXTRACT_KWARGS)
    assert [i.index for i in items] == [0]
    call = responses.calls[0]
    assert call["text_format"] is ExtractOutput
    assert call["input"][0]["content"] == EXTRACTOR_SYSTEM
    assert await llm.extract(**{**EXTRACT_KWARGS, "hits": []}) == []
    assert len(responses.calls) == 1  # no call for an empty batch


async def test_openai_no_effort_omits_reasoning():
    llm, responses = _openai([_response(PLAN)], effort=None)
    await llm.plan_search(
        query="q", category=get_category("lavoro"), language="en", today=date(2026, 11, 23)
    )
    assert "reasoning" not in responses.calls[0]


async def test_openai_refusal():
    llm, _ = _openai([_response(None, refusal=True)])
    with pytest.raises(LLMError) as info:
        await llm.extract(**EXTRACT_KWARGS)
    assert info.value.retryable is False
    assert "declined" in str(info.value)


@pytest.mark.parametrize(
    ("reason", "retryable"), [("max_output_tokens", True), ("content_filter", False)]
)
async def test_openai_incomplete(reason, retryable):
    llm, _ = _openai([_response(ExtractOutput(items=[]), status="incomplete", reason=reason)])
    with pytest.raises(LLMError) as info:
        await llm.extract(**EXTRACT_KWARGS)
    assert reason in str(info.value)
    assert info.value.retryable is retryable


@pytest.mark.parametrize(
    ("error", "retryable"),
    [
        (
            openai.RateLimitError("rl", response=httpx2.Response(429, request=_REQUEST), body=None),
            True,
        ),
        (
            openai.InternalServerError(
                "boom", response=httpx2.Response(500, request=_REQUEST), body=None
            ),
            True,
        ),
        (
            openai.BadRequestError(
                "bad", response=httpx2.Response(400, request=_REQUEST), body=None
            ),
            False,
        ),
        (openai.APIConnectionError(request=_REQUEST), True),
        (openai.APITimeoutError(request=_REQUEST), True),
    ],
)
async def test_openai_errors_map_to_llm_error(error, retryable):
    llm, _ = _openai([error])
    with pytest.raises(LLMError) as info:
        await llm.extract(**EXTRACT_KWARGS)
    assert info.value.retryable is retryable


async def test_openai_truncated_json_inside_sdk_parse():
    try:
        ExtractOutput.model_validate_json('{"items": [{"index": 0')
    except ValidationError as exc:
        truncated = exc
    llm, _ = _openai([truncated])
    with pytest.raises(LLMError):
        await llm.extract(**EXTRACT_KWARGS)


async def test_openai_missing_parsed_output():
    response = _response(ExtractOutput(items=[]))
    response.output_parsed = None
    llm, _ = _openai([response])
    with pytest.raises(LLMError):
        await llm.extract(**EXTRACT_KWARGS)


def test_output_models_are_strict_for_openai_and_match_anthropic_schemas():
    for model, schema in ((PlanOutput, PLAN_SCHEMA), (ExtractOutput, EXTRACT_SCHEMA)):
        fmt = type_to_text_format_param(model)
        assert fmt["strict"] is True
        text = json.dumps(fmt["schema"])
        assert '"default"' not in text
        generated = model.model_json_schema()
        assert set(generated["required"]) == set(generated["properties"])
        assert set(generated["properties"]) == set(schema["properties"])
    item_schema = ExtractItemOutput.model_json_schema()
    assert set(item_schema["required"]) == set(item_schema["properties"])
    assert set(item_schema["properties"]) == set(
        EXTRACT_SCHEMA["properties"]["items"]["items"]["properties"]
    )


async def test_grounding_guards_apply_to_openai_output(settings, engine, client, fake_provider):
    """The same anti-fabrication checks run no matter which provider extracted the fields."""
    plan = PlanOutput(
        summary="Bilocali Alcamo",
        keywords=["bilocale"],
        filters=[],
        search_queries=["bilocale Alcamo"],
    )
    extraction = ExtractOutput(
        items=[
            _item(
                0,
                price="€ 999.000",
                location="Alcamo, Lombardia",
                contacts=["0924 123456", "fake@invented.it"],
            ),
            _item(1, price="98.000 €"),
        ]
    )
    llm, _ = _openai([_response(plan), _response(extraction)])
    container = build_container(
        settings,
        engine=engine,
        llm=llm,
        verify_llm=None,
        search_provider=fake_provider,
        push_sender=None,
        google_verifier=None,
        billing=None,
    )
    user = await register(client)
    sid = await insert_search(container.sessionmaker, user["user"]["id"])
    outcome = await container.pipeline.run(sid, trigger="initial")
    async with container.sessionmaker() as session:
        rows = {
            r.url: r
            for r in (
                await session.execute(select(Result).where(Result.search_id == sid))
            ).scalars()
        }
    await container.http.aclose()
    assert outcome.status == "ok" and outcome.new_results == 0  # pending page verification
    first = rows["https://www.immobiliare.it/annunci/101/"]
    assert first.price is None  # not in the snippet ("450 €/mese" is)
    assert first.location == "Alcamo"
    assert first.contacts == ["0924 123456"]
    assert rows["https://www.idealista.it/immobile/202/"].price == "98.000 €"


# --------------------------------------------------------------------------- selection


@pytest.mark.parametrize(
    ("values", "provider", "model"),
    [
        ({}, None, None),
        ({"openai_api_key": "sk-test"}, "openai", "gpt-6.2-sol"),
        ({"anthropic_api_key": "ak-test"}, "anthropic", "claude-haiku-5-5"),
        ({"anthropic_api_key": "ak", "openai_api_key": "sk"}, "anthropic", "claude-haiku-5-5"),
        (
            {"llm_provider": "openai", "anthropic_api_key": "ak", "openai_api_key": "sk"},
            "openai",
            "gpt-6.2-sol",
        ),
        ({"llm_provider": "anthropic", "openai_api_key": "sk"}, None, None),
        ({"llm_provider": "openai", "anthropic_api_key": "ak"}, None, None),
        ({"openai_api_key": "sk", "llm_model": "gpt-6-luna"}, "openai", "gpt-6-luna"),
        ({"openai_api_key": "sk", "llm_model": "  "}, "openai", "gpt-6.2-sol"),
        ({"openai_api_key": "sk", "llm_provider": ""}, "openai", "gpt-6.2-sol"),
    ],
)
def test_provider_auto_selection(values, provider, model):
    settings = _settings(**values)
    assert settings.resolved_llm_provider == provider
    assert settings.resolved_llm_model == model
    assert settings.llm_configured is (provider is not None)


async def test_build_llm_returns_the_selected_adapter():
    openai_llm = build_llm(_settings(openai_api_key="sk-test"))
    assert isinstance(openai_llm, OpenAILLM)
    assert (openai_llm.provider, openai_llm.model) == ("openai", "gpt-6.2-sol")
    anthropic_llm = build_llm(_settings(openai_api_key="sk", anthropic_api_key="ak"))
    assert isinstance(anthropic_llm, AnthropicLLM)
    assert build_llm(_settings()) is None
    await openai_llm.aclose()
    await anthropic_llm.aclose()


@pytest.mark.parametrize("model", ["gpt-6.2-sol", "gpt-6.2-astra"])
def test_effort_none_rejected_for_sol_and_astra(model):
    with pytest.raises(ValidationError) as info:
        _settings(openai_api_key="sk", llm_model=model, llm_effort="none")
    assert "LLM_EFFORT=none" in str(info.value)


def test_effort_rules():
    assert (
        _settings(openai_api_key="sk", llm_model="gpt-6-luna", llm_effort="none").llm_effort
        == "none"
    )
    assert _settings(openai_api_key="sk", llm_model="gpt-6.1-terra", llm_effort="none")
    assert _settings(openai_api_key="sk").llm_effort == "low"
    assert _settings(openai_api_key="sk", llm_effort="").llm_effort is None
    with pytest.raises(ValidationError):
        _settings(anthropic_api_key="ak", llm_effort="none")
    # Without an active provider there is nothing to validate against.
    assert _settings(llm_effort="none").resolved_llm_provider is None


async def test_health_reports_openai_provider(settings, engine):
    settings.openai_api_key = "sk-test"
    container = build_container(
        settings, engine=engine, search_provider=None, billing=None, google_verifier=None
    )
    app = create_app(container=container)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test/api/v1"
    ) as c:
        body = (await c.get("/health")).json()
    await container.llm.aclose()
    await container.verify_llm.aclose()
    await container.http.aclose()
    assert body["llm_configured"] is True
    assert body["llm_provider"] == "openai"


# --------------------------------------------------------------------------- env files


def test_env_files_resolve_from_package_not_cwd(monkeypatch, tmp_path):
    assert SERVER_DIR == Path(__file__).resolve().parents[1]
    assert (SERVER_DIR / "alembic.ini").is_file()
    assert REPO_ROOT == SERVER_DIR.parent
    assert ENV_FILES == (REPO_ROOT / ".env", SERVER_DIR / ".env")
    assert Settings.model_config["env_file"] == ENV_FILES
    # A .env in the current directory is not read.
    (tmp_path / ".env").write_text("LLM_MODEL=from-cwd\n", encoding="utf-8")
    monkeypatch.chdir(tmp_path)
    assert config_module.Settings(jwt_secret="j" * 40).llm_model != "from-cwd"


def test_env_file_precedence(monkeypatch, tmp_path):
    root_env = tmp_path / "root.env"
    server_env = tmp_path / "server.env"
    root_env.write_text(
        "SERPER_API_KEY=serper-from-root\nOPENAI_API_KEY=openai-from-root\n"
        "LLM_MODEL=model-from-root\nSEARCH_COUNTRY=fr\n",
        encoding="utf-8",
    )
    server_env.write_text("LLM_MODEL=model-from-server\nSEARCH_COUNTRY=de\n", encoding="utf-8")
    files = (root_env, server_env)

    s = Settings(_env_file=files, jwt_secret="j" * 40)  # type: ignore[call-arg]
    assert s.serper_api_key == "serper-from-root"  # only in the root file
    assert s.openai_api_key == "openai-from-root"
    assert s.llm_model == "model-from-server"  # server/.env overrides the root .env
    assert s.search_country == "de"

    monkeypatch.setenv("LLM_MODEL", "model-from-env")
    s = Settings(_env_file=files, jwt_secret="j" * 40)  # type: ignore[call-arg]
    assert s.llm_model == "model-from-env"  # real environment variables win

    missing = (tmp_path / "nope.env", root_env)
    s = Settings(_env_file=missing, jwt_secret="j" * 40)  # type: ignore[call-arg]
    assert s.serper_api_key == "serper-from-root"  # missing files are ignored
