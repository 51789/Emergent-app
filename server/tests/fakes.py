"""Test doubles for every external service (search, LLM, push, Google, Stripe)."""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from collections.abc import Callable, Sequence
from dataclasses import replace
from datetime import date
from typing import Any

import stripe

from app.categories import Category
from app.modules.auth.google import GoogleIdentity, GoogleTokenError
from app.services.fetcher import FetchedPage
from app.services.llm import ExtractedItem, LLMError, PageVerification, QueryPlan
from app.services.normalize import domain_of
from app.services.push import PushMessage, PushReport
from app.services.search_provider import SearchHit, SearchProviderError


def hit(url: str, title: str, snippet: str = "", date_text: str | None = None) -> SearchHit:
    return SearchHit(
        title=title, url=url, snippet=snippet, source_domain=domain_of(url), date_text=date_text
    )


DEFAULT_HITS = [
    hit(
        "https://www.immobiliare.it/annunci/101/",
        "Bilocale in affitto a Alcamo, via Roma",
        "Bilocale arredato 55 mq, 450 €/mese. Tel. 0924 123456",
        "2 giorni fa",
    ),
    hit(
        "https://www.idealista.it/immobile/202/",
        "Trilocale in vendita ad Alcamo",
        "Trilocale luminoso, prezzo 98.000 €, agenzia Casa Sicilia",
    ),
]


class FakeProvider:
    name = "fake"

    def __init__(self) -> None:
        self.hits: list[SearchHit] = list(DEFAULT_HITS)
        self.by_query: dict[str, list[SearchHit]] = {}
        self.calls: list[dict[str, Any]] = []
        self.error: Exception | None = None

    async def search(
        self, query: str, *, language: str, country: str | None, num: int, recency: str | None
    ) -> list[SearchHit]:
        self.calls.append(
            {
                "query": query,
                "language": language,
                "country": country,
                "num": num,
                "recency": recency,
            }
        )
        if self.error is not None:
            raise self.error
        return list(self.by_query.get(query, self.hits))


def default_extract(hits: Sequence[SearchHit]) -> list[ExtractedItem]:
    return [
        ExtractedItem(index=i, relevant=True, summary=f"Sintesi: {h.title}")
        for i, h in enumerate(hits)
    ]


class FakeLLM:
    provider = "fake"
    model = "fake-model"

    def __init__(self) -> None:
        self.plan = QueryPlan(
            summary="Bilocali in affitto ad Alcamo",
            keywords=["bilocale", "affitto", "alcamo"],
            filters={"location": "Alcamo", "max_price": "500"},
            web_queries=["bilocale affitto Alcamo", "bilocale affitto Alcamo site:immobiliare.it"],
        )
        self.extract_impl: Callable[[Sequence[SearchHit]], list[ExtractedItem]] = default_extract
        self.plan_calls = 0
        self.extract_calls: list[list[SearchHit]] = []
        self.error: LLMError | None = None
        # url -> PageVerification (default: available + relevant, no extra fields)
        self.verifications: dict[str, PageVerification | LLMError] = {}
        self.verify_calls: list[dict[str, Any]] = []

    async def plan_search(
        self, *, query: str, category: Category, language: str, today: date
    ) -> QueryPlan:
        self.plan_calls += 1
        if self.error is not None:
            raise self.error
        return replace(
            self.plan,
            keywords=list(self.plan.keywords),
            filters=dict(self.plan.filters),
            web_queries=list(self.plan.web_queries),
        )

    async def extract(
        self,
        *,
        query: str,
        category: Category,
        language: str,
        plan: QueryPlan,
        hits: Sequence[SearchHit],
        today: date,
    ) -> list[ExtractedItem]:
        self.extract_calls.append(list(hits))
        if self.error is not None:
            raise self.error
        return self.extract_impl(hits)

    async def verify_page(self, **kwargs: Any) -> PageVerification:
        self.verify_calls.append(kwargs)
        result = self.verifications.get(
            kwargs["hit"].url, PageVerification(page_state="available", relevant=True)
        )
        if isinstance(result, LLMError):
            raise result
        return result

    async def aclose(self) -> None:
        return None


class FakeFetcher:
    """Return a readable listing unless the test specifies another response."""

    def __init__(self) -> None:
        self.pages: dict[str, FetchedPage] = {}
        self.calls: list[str] = []

    async def fetch(self, url: str) -> FetchedPage:
        self.calls.append(url)
        return self.pages.get(url, FetchedPage("ok", url, 200, text="Listing available."))


class FakePush:
    def __init__(self) -> None:
        self.sent: list[PushMessage] = []
        self.unregistered: set[str] = set()

    async def send(self, messages: Sequence[PushMessage]) -> PushReport:
        self.sent.extend(messages)
        invalid = [m.to for m in messages if m.to in self.unregistered]
        return PushReport(
            sent=len(messages) - len(invalid), failed=len(invalid), invalid_tokens=invalid
        )


class FakeGoogle:
    def __init__(self) -> None:
        self.identities: dict[str, GoogleIdentity] = {}

    async def verify(self, token: str) -> GoogleIdentity:
        if token not in self.identities:
            raise GoogleTokenError("bad token")
        return self.identities[token]


class FakeBilling:
    """Stripe stand-in. Webhook signatures are verified with the real Stripe SDK."""

    def __init__(self, webhook_secret: str) -> None:
        self.webhook_secret = webhook_secret
        self.subscriptions: dict[str, dict[str, Any]] = {}
        self.customers: list[dict[str, str]] = []
        self.checkouts: list[dict[str, Any]] = []
        self.portals: list[dict[str, str]] = []
        self.cancelled: list[str] = []
        self.retrieved: list[str] = []

    async def create_customer(self, *, email: str, user_id: str) -> str:
        self.customers.append({"email": email, "user_id": user_id})
        return f"cus_test_{len(self.customers)}"

    async def create_checkout_session(self, **kwargs: Any) -> str:
        self.checkouts.append(kwargs)
        return f"https://checkout.stripe.test/c/{len(self.checkouts)}"

    async def create_portal_session(self, *, customer_id: str, return_url: str) -> str:
        self.portals.append({"customer_id": customer_id, "return_url": return_url})
        return "https://billing.stripe.test/portal"

    async def retrieve_subscription(self, subscription_id: str) -> dict[str, Any] | None:
        self.retrieved.append(subscription_id)
        return self.subscriptions.get(subscription_id)

    async def cancel_subscription(self, subscription_id: str) -> None:
        self.cancelled.append(subscription_id)

    def construct_event(self, payload: bytes, signature: str | None) -> dict[str, Any]:
        return stripe.Webhook.construct_event(
            payload, signature or "", self.webhook_secret
        ).to_dict()


def sign_stripe_payload(payload: bytes, secret: str, timestamp: int | None = None) -> str:
    ts = timestamp or int(time.time())
    signed = f"{ts}.".encode() + payload
    digest = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
    return f"t={ts},v1={digest}"


def stripe_event(event_id: str, event_type: str, obj: dict[str, Any]) -> bytes:
    return json.dumps(
        {
            "id": event_id,
            "object": "event",
            "type": event_type,
            "created": int(time.time()),
            "data": {"object": obj},
            "livemode": False,
            "api_version": "2025-03-31.basil",
        }
    ).encode()


__all__ = [
    "DEFAULT_HITS",
    "FakeBilling",
    "FakeGoogle",
    "FakeLLM",
    "FakePush",
    "FakeProvider",
    "SearchProviderError",
    "hit",
    "sign_stripe_payload",
    "stripe_event",
]
