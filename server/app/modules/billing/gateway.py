"""Thin async wrapper around the official Stripe SDK (behind an interface for tests)."""

from __future__ import annotations

from typing import Any, Protocol

import stripe


class BillingGateway(Protocol):
    async def create_customer(self, *, email: str, user_id: str) -> str: ...

    async def create_checkout_session(
        self,
        *,
        customer_id: str,
        price_id: str,
        user_id: str,
        plan: str,
        cycle: str,
        success_url: str,
        cancel_url: str,
    ) -> str: ...

    async def create_portal_session(self, *, customer_id: str, return_url: str) -> str: ...

    async def retrieve_subscription(self, subscription_id: str) -> dict[str, Any] | None: ...

    async def cancel_subscription(self, subscription_id: str) -> None: ...

    def construct_event(self, payload: bytes, signature: str | None) -> dict[str, Any]: ...


class StripeGateway:
    def __init__(self, secret_key: str, webhook_secret: str) -> None:
        self._client = stripe.StripeClient(secret_key, http_client=stripe.HTTPXClient())
        self._webhook_secret = webhook_secret

    async def create_customer(self, *, email: str, user_id: str) -> str:
        customer = await self._client.v1.customers.create_async(
            params={"email": email, "metadata": {"user_id": user_id}}
        )
        return customer.id

    async def create_checkout_session(
        self,
        *,
        customer_id: str,
        price_id: str,
        user_id: str,
        plan: str,
        cycle: str,
        success_url: str,
        cancel_url: str,
    ) -> str:
        metadata = {"user_id": user_id, "plan": plan, "cycle": cycle}
        session = await self._client.v1.checkout.sessions.create_async(
            params={
                "mode": "subscription",
                "customer": customer_id,
                "client_reference_id": user_id,
                "line_items": [{"price": price_id, "quantity": 1}],
                "success_url": success_url,
                "cancel_url": cancel_url,
                "allow_promotion_codes": True,
                "metadata": metadata,
                "subscription_data": {"metadata": metadata},
            }
        )
        if not session.url:
            raise RuntimeError("Stripe did not return a checkout URL")
        return session.url

    async def create_portal_session(self, *, customer_id: str, return_url: str) -> str:
        session = await self._client.v1.billing_portal.sessions.create_async(
            params={"customer": customer_id, "return_url": return_url}
        )
        return session.url

    async def retrieve_subscription(self, subscription_id: str) -> dict[str, Any] | None:
        """Current subscription state, or None if Stripe doesn't know the id."""
        try:
            subscription = await self._client.v1.subscriptions.retrieve_async(subscription_id)
        except stripe.InvalidRequestError as exc:
            if getattr(exc, "code", None) == "resource_missing":
                return None
            raise
        return subscription.to_dict()

    async def cancel_subscription(self, subscription_id: str) -> None:
        await self._client.v1.subscriptions.cancel_async(subscription_id)

    def construct_event(self, payload: bytes, signature: str | None) -> dict[str, Any]:
        """Verify the Stripe-Signature header. Raises stripe.SignatureVerificationError."""
        event = stripe.Webhook.construct_event(payload, signature or "", self._webhook_secret)
        return event.to_dict()
