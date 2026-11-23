"""FastAPI application factory. Run with: uvicorn app.main:app"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.bootstrap import bootstrap_admin
from app.container import Container, build_container
from app.core.config import Settings, get_settings
from app.core.errors import install_error_handlers
from app.core.logging import configure_logging
from app.modules.admin.router import router as admin_router
from app.modules.auth.router import router as auth_router
from app.modules.billing.router import router as billing_router
from app.modules.health import router as health_router
from app.modules.notifications.router import router as notifications_router
from app.modules.results.router import router as results_router
from app.modules.searches.router import router as searches_router
from app.modules.users.router import router as users_router
from app.services.scheduler import MonitorScheduler

logger = logging.getLogger(__name__)

API_PREFIX = "/api/v1"


def create_app(settings: Settings | None = None, container: Container | None = None) -> FastAPI:
    """Build the app. Pass `container` to inject fakes (tests); else it's built at startup."""
    if settings is None:
        settings = container.settings if container is not None else get_settings()
    configure_logging(settings.log_level)
    owns_container = container is None

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        if owns_container:
            app.state.container = build_container(settings)
        current: Container = app.state.container
        if current.llm is not None:
            logger.info("LLM provider: %s (%s)", current.llm.provider, current.llm.model)
        else:
            logger.warning("No LLM API key set (ANTHROPIC_API_KEY / OPENAI_API_KEY)")
        if current.verifier is not None and current.verify_llm is not None:
            logger.info("Page verification: on (%s)", current.verify_llm.model)
        else:
            logger.info("Page verification: off")
        try:
            await bootstrap_admin(current.sessionmaker, settings)
        except Exception:
            logger.exception("Admin bootstrap failed (is the database migrated?)")
        scheduler: MonitorScheduler | None = None
        if settings.run_scheduler_in_process:
            scheduler = MonitorScheduler(current.pipeline, settings)
            scheduler.start()
        try:
            yield
        finally:
            if scheduler is not None:
                scheduler.shutdown()
            if owns_container:
                await current.aclose()

    app = FastAPI(
        title="Consulens API",
        description="Consulens: monitors the web for each user's saved searches and notifies "
        "them about new matching listings, calls, offers and laws.",
        version="2.0.0",
        lifespan=lifespan,
        openapi_url=f"{API_PREFIX}/openapi.json",
        docs_url=f"{API_PREFIX}/docs",
        redoc_url=None,
    )
    if container is not None:
        app.state.container = container

    install_error_handlers(app)

    origins = settings.cors_origin_list
    if origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"] if "*" in origins else origins,
            allow_credentials=False,  # bearer tokens, no cookies
            allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
            allow_headers=["Authorization", "Content-Type"],
            max_age=600,
        )

    api = APIRouter(prefix=API_PREFIX)
    for router in (
        health_router,
        auth_router,
        users_router,
        searches_router,
        results_router,
        notifications_router,
        billing_router,
        admin_router,
    ):
        api.include_router(router)
    app.include_router(api)
    return app


app = create_app()
