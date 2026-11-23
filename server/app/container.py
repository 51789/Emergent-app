"""Wires together settings, the database and external service clients.

Tests build a Container with fakes (`build_container(settings, llm=FakeLLM(), ...)`).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

import httpx
from sqlalchemy.ext.asyncio import AsyncEngine

from app.core.config import Settings
from app.db.session import SessionMaker, create_engine, create_sessionmaker
from app.modules.auth.google import GoogleIdTokenVerifier, GoogleVerifier
from app.modules.billing.gateway import BillingGateway, StripeGateway
from app.services.fetcher import HttpPageFetcher, PageFetcher
from app.services.llm import LLMClient, build_llm
from app.services.notifier import PushNotifier
from app.services.pipeline import SearchPipeline
from app.services.push import ExpoPushClient, PushSender
from app.services.search_provider import SearchProvider, build_search_provider
from app.services.verifier import ResultVerifier

logger = logging.getLogger(__name__)

_UNSET: Any = object()


@dataclass
class Container:
    settings: Settings
    engine: AsyncEngine
    sessionmaker: SessionMaker
    http: httpx.AsyncClient
    llm: LLMClient | None
    search_provider: SearchProvider | None
    push_sender: PushSender | None
    google_verifier: GoogleVerifier | None
    billing: BillingGateway | None
    notifier: PushNotifier
    pipeline: SearchPipeline
    verify_llm: LLMClient | None = None
    page_fetcher: PageFetcher | None = None
    verifier: ResultVerifier | None = None

    async def aclose(self) -> None:
        for client in {id(c): c for c in (self.llm, self.verify_llm) if c is not None}.values():
            try:
                await client.aclose()
            except Exception:
                logger.warning("Error closing LLM client", exc_info=True)
        await self.http.aclose()
        await self.engine.dispose()


def build_container(
    settings: Settings,
    *,
    engine: AsyncEngine | None = None,
    http: httpx.AsyncClient | None = None,
    llm: Any = _UNSET,
    search_provider: Any = _UNSET,
    push_sender: Any = _UNSET,
    google_verifier: Any = _UNSET,
    billing: Any = _UNSET,
    verify_llm: Any = _UNSET,
    page_fetcher: Any = _UNSET,
) -> Container:
    engine = engine or create_engine(settings)
    sessionmaker = create_sessionmaker(engine)
    http = http or httpx.AsyncClient(timeout=httpx.Timeout(20.0, connect=5.0))

    if llm is _UNSET:
        llm = build_llm(settings)
    if search_provider is _UNSET:
        search_provider = build_search_provider(settings, http)
    if push_sender is _UNSET:
        push_sender = ExpoPushClient(
            http, url=settings.expo_push_url, access_token=settings.expo_access_token
        )
    if google_verifier is _UNSET:
        ids = settings.google_client_id_list
        google_verifier = GoogleIdTokenVerifier(ids) if ids else None
    if billing is _UNSET:
        billing = (
            StripeGateway(settings.stripe_secret_key, settings.stripe_webhook_secret)
            if settings.stripe_secret_key and settings.stripe_webhook_secret
            else None
        )

    if verify_llm is _UNSET:
        verify_llm = build_llm(settings, purpose="verify")
    if page_fetcher is _UNSET:
        page_fetcher = HttpPageFetcher(
            http,
            user_agent=settings.verify_user_agent,
            timeout=settings.verify_timeout_seconds,
            max_bytes=settings.verify_max_bytes,
            max_chars=settings.verify_max_text_chars,
            concurrency=settings.verify_concurrency,
            per_domain=settings.verify_per_domain_concurrency,
            robots_ttl=settings.verify_robots_ttl_seconds,
        )
    verifier = (
        ResultVerifier(page_fetcher, verify_llm, concurrency=settings.verify_concurrency)
        if settings.verify_pages and verify_llm is not None and page_fetcher is not None
        else None
    )

    notifier = PushNotifier(sessionmaker, push_sender)
    pipeline = SearchPipeline(
        sessionmaker=sessionmaker,
        settings=settings,
        llm=llm,
        provider=search_provider,
        notifier=notifier,
        verifier=verifier,
    )
    return Container(
        settings=settings,
        engine=engine,
        sessionmaker=sessionmaker,
        http=http,
        llm=llm,
        search_provider=search_provider,
        push_sender=push_sender,
        google_verifier=google_verifier,
        billing=billing,
        notifier=notifier,
        pipeline=pipeline,
        verify_llm=verify_llm,
        page_fetcher=page_fetcher,
        verifier=verifier,
    )
