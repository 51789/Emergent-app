from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, StringConstraints

from app.core.plans import PlanDef, plan_features

# Any absolute URL with a scheme (https:// or an app deep-link scheme such as consulens://).
RedirectUrl = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True, max_length=2048, pattern=r"^[A-Za-z][A-Za-z0-9+.\-]*://\S+$"
    ),
]


class Price(BaseModel):
    amount_cents: int
    currency: str


class Prices(BaseModel):
    monthly: Price | None
    yearly: Price | None


class PlanOut(BaseModel):
    id: Literal["free", "pro", "premium"]
    name: str
    max_active_searches: int
    refresh_interval_hours: int
    prices: Prices
    features: list[str]


def plan_out(plan: PlanDef, language: str) -> PlanOut:
    def price(cents: int | None) -> Price | None:
        return Price(amount_cents=cents, currency=plan.currency) if cents is not None else None

    return PlanOut(
        id=plan.id,  # type: ignore[arg-type]
        name=plan.name,
        max_active_searches=plan.max_active_searches,
        refresh_interval_hours=plan.refresh_interval_hours,
        prices=Prices(monthly=price(plan.monthly_cents), yearly=price(plan.yearly_cents)),
        features=plan_features(plan, language),
    )


class BillingMeOut(BaseModel):
    plan: Literal["free", "pro", "premium"]
    cycle: Literal["monthly", "yearly"] | None
    status: Literal["active", "canceled", "past_due", "none"]
    current_period_end: datetime | None
    cancel_at_period_end: bool


class CheckoutIn(BaseModel):
    plan: Literal["pro", "premium"]
    cycle: Literal["monthly", "yearly"]
    success_url: RedirectUrl
    cancel_url: RedirectUrl


class PortalIn(BaseModel):
    return_url: RedirectUrl


class UrlOut(BaseModel):
    url: str
