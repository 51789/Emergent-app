from __future__ import annotations

from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

from app.core.deps import ContainerDep

router = APIRouter(tags=["health"])


class HealthOut(BaseModel):
    status: Literal["ok"]
    llm_configured: bool
    llm_provider: str | None  # "anthropic" | "openai" | null
    search_provider_configured: bool
    stripe_configured: bool


@router.get("/health", response_model=HealthOut)
async def health(container: ContainerDep) -> HealthOut:
    return HealthOut(
        status="ok",
        llm_configured=container.llm is not None,
        llm_provider=container.llm.provider if container.llm is not None else None,
        search_provider_configured=container.search_provider is not None,
        stripe_configured=container.billing is not None,
    )
