from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Header, Query, Request

from app.categories import LanguageCode
from app.core.deps import ContainerDep, CurrentUser, SessionDep
from app.core.plans import PLANS
from app.modules.billing.schemas import (
    BillingMeOut,
    CheckoutIn,
    PlanOut,
    PortalIn,
    UrlOut,
    plan_out,
)
from app.modules.billing.service import BillingService

router = APIRouter(prefix="/billing", tags=["billing"])


@router.get("/plans", response_model=list[PlanOut])
async def list_plans(language: Annotated[LanguageCode, Query()] = "it") -> list[PlanOut]:
    return [plan_out(plan, language) for plan in PLANS.values()]


@router.get("/me", response_model=BillingMeOut)
async def billing_me(
    session: SessionDep, container: ContainerDep, user: CurrentUser
) -> BillingMeOut:
    return await BillingService(session, container.settings, container.billing).me(user)


@router.post("/checkout", response_model=UrlOut)
async def checkout(
    data: CheckoutIn, session: SessionDep, container: ContainerDep, user: CurrentUser
) -> UrlOut:
    url = await BillingService(session, container.settings, container.billing).checkout(
        user,
        plan=data.plan,
        cycle=data.cycle,
        success_url=data.success_url,
        cancel_url=data.cancel_url,
    )
    return UrlOut(url=url)


@router.post("/portal", response_model=UrlOut)
async def portal(
    data: PortalIn, session: SessionDep, container: ContainerDep, user: CurrentUser
) -> UrlOut:
    url = await BillingService(session, container.settings, container.billing).portal(
        user, data.return_url
    )
    return UrlOut(url=url)


@router.post("/webhook", include_in_schema=False)
async def webhook(
    request: Request,
    session: SessionDep,
    container: ContainerDep,
    stripe_signature: Annotated[str | None, Header(alias="Stripe-Signature")] = None,
) -> dict[str, bool]:
    payload = await request.body()
    await BillingService(session, container.settings, container.billing).handle_webhook(
        payload, stripe_signature
    )
    return {"received": True}
