"""Stripe subscriptions: checkout, customer portal and webhook-driven plan updates.

Webhook handling re-fetches the subscription from Stripe for every relevant event, so the
stored state reflects Stripe's current truth regardless of delivery order. Each event id is
recorded in `stripe_events` inside the same transaction (idempotency).
"""

from __future__ import annotations

import logging
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from typing import Any

import stripe
from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.errors import AppError
from app.core.plans import effective_plan
from app.db.models import StripeEvent, Subscription, User
from app.modules.billing.gateway import BillingGateway
from app.modules.billing.schemas import BillingMeOut

logger = logging.getLogger(__name__)

SUBSCRIPTION_EVENTS = {
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "customer.subscription.paused",
    "customer.subscription.resumed",
}
INVOICE_EVENTS = {"invoice.paid", "invoice.payment_succeeded", "invoice.payment_failed"}

_STATUS_MAP = {
    "active": "active",
    "trialing": "active",
    "past_due": "past_due",
    "unpaid": "past_due",
    "canceled": "canceled",
    "incomplete_expired": "canceled",
    "incomplete": "none",
    "paused": "none",
}


def _not_configured(what: str = "Billing") -> AppError:
    return AppError(503, "billing_not_configured", f"{what} is not configured")


def _ts(value: Any) -> datetime | None:
    if value in (None, ""):
        return None
    return datetime.fromtimestamp(int(value), tz=UTC)


def _id(value: Any) -> str | None:
    """Stripe fields can be an id string or an expanded object."""
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return value.get("id")
    return None


def _first_item(subscription: dict[str, Any]) -> dict[str, Any]:
    items = (subscription.get("items") or {}).get("data") or []
    return items[0] if items else {}


@contextmanager
def _stripe_errors() -> Iterator[None]:
    """Stripe API failures become a 502 (for webhooks this also makes Stripe retry)."""
    try:
        yield
    except stripe.StripeError as exc:
        logger.warning("Stripe API error: %s", exc.__class__.__name__)
        raise AppError(
            502, "billing_provider_error", "The payment provider is unavailable, please retry"
        ) from exc


class BillingService:
    def __init__(
        self, session: AsyncSession, settings: Settings, gateway: BillingGateway | None
    ) -> None:
        self.session = session
        self.settings = settings
        self.gateway = gateway

    async def _subscription_row(self, user_id: uuid.UUID) -> Subscription | None:
        return await self.session.get(Subscription, user_id)

    async def me(self, user: User) -> BillingMeOut:
        row = await self._subscription_row(user.id)
        plan = effective_plan(
            user.plan, user.plan_expires_at, self.settings.plan_expiry_grace_hours
        )
        if row is None:
            return BillingMeOut(
                plan=plan,
                cycle=None,
                status="none",
                current_period_end=None,
                cancel_at_period_end=False,
            )  # type: ignore[arg-type]
        return BillingMeOut(
            plan=plan,  # type: ignore[arg-type]
            cycle=row.cycle,  # type: ignore[arg-type]
            status=row.status,  # type: ignore[arg-type]
            current_period_end=row.current_period_end,
            cancel_at_period_end=row.cancel_at_period_end,
        )

    async def checkout(
        self, user: User, *, plan: str, cycle: str, success_url: str, cancel_url: str
    ) -> str:
        if self.gateway is None:
            raise _not_configured()
        price_id = self.settings.stripe_price_map.get((plan, cycle))
        if not price_id:
            raise _not_configured(f"The {plan} {cycle} price")
        row = await self._subscription_row(user.id)
        if row is None:
            row = Subscription(user_id=user.id, status="none")
            self.session.add(row)
        if row.status in ("active", "past_due") and row.stripe_subscription_id:
            raise AppError(
                409,
                "already_subscribed",
                "You already have a subscription; manage or change it from the billing portal",
            )
        if not row.stripe_customer_id:
            with _stripe_errors():
                row.stripe_customer_id = await self.gateway.create_customer(
                    email=user.email, user_id=str(user.id)
                )
        await self.session.commit()  # persist the customer id before redirecting
        with _stripe_errors():
            return await self.gateway.create_checkout_session(
                customer_id=row.stripe_customer_id,
                price_id=price_id,
                user_id=str(user.id),
                plan=plan,
                cycle=cycle,
                success_url=success_url,
                cancel_url=cancel_url,
            )

    async def portal(self, user: User, return_url: str) -> str:
        if self.gateway is None:
            raise _not_configured()
        row = await self._subscription_row(user.id)
        if row is None or not row.stripe_customer_id:
            raise AppError(409, "no_billing_account", "No billing account exists for this user")
        with _stripe_errors():
            return await self.gateway.create_portal_session(
                customer_id=row.stripe_customer_id, return_url=return_url
            )

    # ------------------------------------------------------------------ webhook

    async def handle_webhook(self, payload: bytes, signature: str | None) -> None:
        if self.gateway is None:
            raise _not_configured()
        try:
            event = self.gateway.construct_event(payload, signature)
        except stripe.SignatureVerificationError as exc:
            raise AppError(400, "invalid_signature", "Invalid Stripe signature") from exc
        except ValueError as exc:
            raise AppError(400, "invalid_payload", "Invalid webhook payload") from exc

        event_id = str(event.get("id") or "")
        event_type = str(event.get("type") or "")
        if not event_id:
            raise AppError(400, "invalid_payload", "Event has no id")

        inserted = await self.session.execute(
            pg_insert(StripeEvent)
            .values(
                id=event_id,
                type=event_type[:100],
                created_at=_ts(event.get("created")) or datetime.now(UTC),
            )
            .on_conflict_do_nothing(index_elements=[StripeEvent.id])
            .returning(StripeEvent.id)
        )
        if inserted.scalar_one_or_none() is None:
            await self.session.rollback()
            logger.info("Stripe event %s already processed", event_id)
            return

        obj: dict[str, Any] = (event.get("data") or {}).get("object") or {}
        subscription_id: str | None = None
        hint_user_id: str | None = None
        if event_type == "checkout.session.completed" and obj.get("mode") == "subscription":
            subscription_id = _id(obj.get("subscription"))
            hint_user_id = obj.get("client_reference_id") or (obj.get("metadata") or {}).get(
                "user_id"
            )
        elif event_type in SUBSCRIPTION_EVENTS:
            subscription_id = _id(obj.get("id"))
        elif event_type in INVOICE_EVENTS:
            subscription_id = _id(obj.get("subscription")) or _id(
                ((obj.get("parent") or {}).get("subscription_details") or {}).get("subscription")
            )

        user_id: uuid.UUID | None = None
        if subscription_id:
            with _stripe_errors():
                subscription = await self.gateway.retrieve_subscription(subscription_id)
            if subscription is None:
                logger.warning("Stripe subscription %s not found", subscription_id)
            else:
                user_id = await self._apply_subscription(subscription, hint_user_id)
        if user_id is not None:
            await self.session.execute(
                update(StripeEvent).where(StripeEvent.id == event_id).values(user_id=user_id)
            )
        await self.session.commit()

    async def _find_user(
        self, subscription: dict[str, Any], hint_user_id: str | None
    ) -> tuple[User | None, Subscription | None]:
        candidates = [hint_user_id, (subscription.get("metadata") or {}).get("user_id")]
        for candidate in candidates:
            if not candidate:
                continue
            try:
                user = await self.session.get(User, uuid.UUID(str(candidate)), with_for_update=True)
            except ValueError:
                continue
            if user is not None:
                return user, await self._subscription_row(user.id)
        customer_id = _id(subscription.get("customer"))
        conditions = [Subscription.stripe_subscription_id == subscription.get("id")]
        if customer_id:
            conditions.append(Subscription.stripe_customer_id == customer_id)
        for condition in conditions:
            row = (
                await self.session.execute(select(Subscription).where(condition))
            ).scalar_one_or_none()
            if row is not None:
                user = await self.session.get(User, row.user_id, with_for_update=True)
                return user, row
        return None, None

    async def _apply_subscription(
        self, subscription: dict[str, Any], hint_user_id: str | None
    ) -> uuid.UUID | None:
        user, row = await self._find_user(subscription, hint_user_id)
        if user is None:
            logger.warning("Stripe subscription %s does not match any user", subscription.get("id"))
            return None
        if row is None:
            row = Subscription(user_id=user.id, status="none")
            self.session.add(row)

        sub_id = subscription.get("id")
        status = _STATUS_MAP.get(str(subscription.get("status")), "none")
        if (
            row.stripe_subscription_id
            and row.stripe_subscription_id != sub_id
            and row.status == "active"
            and status != "active"
        ):
            # An old subscription ended while a newer one is active: ignore it.
            return user.id

        item = _first_item(subscription)
        price_id = _id(item.get("price"))
        reverse = {v: k for k, v in self.settings.stripe_price_map.items()}
        plan_cycle = reverse.get(price_id or "")
        if plan_cycle is None:
            meta = subscription.get("metadata") or {}
            if meta.get("plan") in ("pro", "premium") and meta.get("cycle") in (
                "monthly",
                "yearly",
            ):
                plan_cycle = (meta["plan"], meta["cycle"])
            else:
                logger.warning("Unknown Stripe price %s on subscription %s", price_id, sub_id)
        period_end = _ts(subscription.get("current_period_end")) or _ts(
            item.get("current_period_end")
        )

        row.stripe_customer_id = _id(subscription.get("customer")) or row.stripe_customer_id
        row.stripe_subscription_id = sub_id
        row.stripe_price_id = price_id
        row.stripe_status = str(subscription.get("status"))[:32]
        row.status = status
        row.current_period_end = period_end
        row.cancel_at_period_end = bool(subscription.get("cancel_at_period_end"))
        if plan_cycle is not None:
            row.plan, row.cycle = plan_cycle

        if status in ("active", "past_due") and plan_cycle is not None:
            user.plan = plan_cycle[0]
            user.plan_expires_at = period_end
        elif status in ("canceled", "none"):
            user.plan = "free"
            user.plan_expires_at = None
        return user.id
