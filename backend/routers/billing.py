"""
Billing router for JARVIS subscriptions.

Handles PRO / PREMIUM plan payments via Stripe Checkout (one-off payment mode
using the Emergent-managed Stripe test key `sk_test_emergent`). Each successful
payment extends the user's plan by 30 days (monthly) or 365 days (yearly).

MVP note
--------
This uses one-off Stripe Checkout sessions (`mode='payment'`) instead of true
recurring subscriptions. On payment success the backend polls the session
status via `GET /billing/status/{session_id}` and applies the plan/expiry to
the user document. Renewal is done by the user paying again from the app.
Auto-renewal via `mode='subscription'` + webhooks is a future upgrade path.
"""
from __future__ import annotations

import os
import uuid
import logging
from datetime import datetime, timedelta
from typing import Any, Callable, Dict, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from motor.motor_asyncio import AsyncIOMotorDatabase

from emergentintegrations.payments.stripe.checkout import (
    StripeCheckout,
    CheckoutSessionRequest,
)

logger = logging.getLogger(__name__)


# ---------- Server-side plan pricing (source of truth) ----------
# Amounts are in EUR. Never trust prices coming from the client.
PLAN_PRICES: Dict[str, Dict[str, float]] = {
    "pro": {"monthly": 2.99, "yearly": 29.99},
    "premium": {"monthly": 4.99, "yearly": 49.99},
}

PLAN_DURATION_DAYS: Dict[str, int] = {"monthly": 30, "yearly": 365}


# ---------- Pydantic models ----------
class CheckoutIn(BaseModel):
    plan: Literal["pro", "premium"]
    billing_cycle: Literal["monthly", "yearly"] = "monthly"
    success_url: str = Field(..., description="Frontend URL to return to on success. Must contain {CHECKOUT_SESSION_ID} placeholder or will be appended.")
    cancel_url: str = Field(..., description="Frontend URL to return to on cancel.")


class CheckoutOut(BaseModel):
    url: str
    session_id: str
    amount: float
    currency: str = "eur"


class BillingStatusOut(BaseModel):
    session_id: str
    status: str  # 'open' | 'complete' | 'expired'
    payment_status: str  # 'paid' | 'unpaid' | 'no_payment_required'
    plan_applied: bool
    plan: Optional[str] = None
    billing_cycle: Optional[str] = None
    expires_at: Optional[datetime] = None


class MyBillingOut(BaseModel):
    plan: str
    plan_expires_at: Optional[datetime]
    subscription_active: bool
    billing_cycle: Optional[str]


# ---------- Factory ----------
def build_billing_router(
    db: AsyncIOMotorDatabase,
    get_current_user: Callable,
) -> APIRouter:
    """Build the `/billing/*` router. Endpoints will be mounted under `/api`."""
    router = APIRouter(prefix="/billing", tags=["billing"])

    api_key = os.getenv("STRIPE_API_KEY", "sk_test_emergent")
    webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET")  # optional

    stripe = StripeCheckout(api_key=api_key, webhook_secret=webhook_secret)

    async def _record_transaction(
        user_id: str,
        session_id: str,
        plan: str,
        billing_cycle: str,
        amount: float,
        status: str,
    ) -> None:
        await db.transactions.update_one(
            {"session_id": session_id},
            {
                "$set": {
                    "session_id": session_id,
                    "user_id": user_id,
                    "plan": plan,
                    "billing_cycle": billing_cycle,
                    "amount": amount,
                    "currency": "eur",
                    "status": status,
                    "updated_at": datetime.utcnow(),
                },
                "$setOnInsert": {
                    "id": str(uuid.uuid4()),
                    "created_at": datetime.utcnow(),
                },
            },
            upsert=True,
        )

    async def _apply_plan(user_id: str, plan: str, billing_cycle: str) -> datetime:
        days = PLAN_DURATION_DAYS[billing_cycle]
        # If user is already on a plan and it hasn't expired, extend from current expiry.
        user = await db.users.find_one({"id": user_id}) or await db.users.find_one({"_id": user_id})
        now = datetime.utcnow()
        base = now
        current_exp = user.get("plan_expires_at") if user else None
        if current_exp:
            try:
                if isinstance(current_exp, str):
                    current_exp = datetime.fromisoformat(current_exp.replace("Z", "+00:00")).replace(tzinfo=None)
                if isinstance(current_exp, datetime) and current_exp > now:
                    base = current_exp
            except Exception:
                base = now
        new_expiry = base + timedelta(days=days)
        await db.users.update_one(
            {"id": user_id},
            {
                "$set": {
                    "plan": plan,
                    "plan_expires_at": new_expiry,
                    "billing_cycle": billing_cycle,
                    "subscription_active": True,
                    "updated_at": datetime.utcnow(),
                }
            },
        )
        return new_expiry

    # -------- POST /billing/checkout --------
    @router.post("/checkout", response_model=CheckoutOut)
    async def create_checkout(
        body: CheckoutIn,
        user: Dict[str, Any] = Depends(get_current_user),
    ):
        try:
            amount = PLAN_PRICES[body.plan][body.billing_cycle]
        except KeyError:
            raise HTTPException(400, "Invalid plan or billing cycle")

        # Ensure success URL has the session_id template Stripe will populate.
        success_url = body.success_url
        if "{CHECKOUT_SESSION_ID}" not in success_url and "session_id=" not in success_url:
            sep = "&" if "?" in success_url else "?"
            success_url = f"{success_url}{sep}session_id={{CHECKOUT_SESSION_ID}}"

        user_id = user.get("id") or str(user.get("_id"))
        req = CheckoutSessionRequest(
            amount=amount,
            currency="eur",
            success_url=success_url,
            cancel_url=body.cancel_url,
            metadata={
                "user_id": user_id,
                "user_email": user.get("email", ""),
                "plan": body.plan,
                "billing_cycle": body.billing_cycle,
            },
        )
        try:
            resp = await stripe.create_checkout_session(req)
        except Exception as e:
            logger.exception("Stripe checkout creation failed")
            raise HTTPException(502, f"Stripe error: {e}")

        # Record a pending transaction
        await _record_transaction(
            user_id=user_id,
            session_id=resp.session_id,
            plan=body.plan,
            billing_cycle=body.billing_cycle,
            amount=amount,
            status="initiated",
        )
        return CheckoutOut(
            url=resp.url,
            session_id=resp.session_id,
            amount=amount,
            currency="eur",
        )

    # -------- GET /billing/status/{session_id} --------
    @router.get("/status/{session_id}", response_model=BillingStatusOut)
    async def get_status(
        session_id: str,
        user: Dict[str, Any] = Depends(get_current_user),
    ):
        try:
            status = await stripe.get_checkout_status(session_id)
        except Exception as e:
            logger.exception("Stripe status fetch failed")
            raise HTTPException(502, f"Stripe error: {e}")

        # Load our transaction to know which plan/cycle this session paid for.
        tx = await db.transactions.find_one({"session_id": session_id})
        if not tx:
            raise HTTPException(404, "Transaction not found for this session")

        user_id = user.get("id") or str(user.get("_id"))
        if tx.get("user_id") != user_id:
            # Prevent cross-user session leaks
            raise HTTPException(403, "Session does not belong to current user")

        plan_applied = tx.get("status") == "applied"
        plan_out = tx.get("plan")
        cycle_out = tx.get("billing_cycle")
        expires_at: Optional[datetime] = None

        # Apply the plan the FIRST time we see it paid — idempotent via tx.status.
        payment_status = status.payment_status or ""
        if payment_status == "paid" and not plan_applied:
            expires_at = await _apply_plan(user_id, tx["plan"], tx["billing_cycle"])
            await db.transactions.update_one(
                {"session_id": session_id},
                {"$set": {"status": "applied", "paid_at": datetime.utcnow(), "expires_at": expires_at}},
            )
            plan_applied = True
        elif plan_applied:
            expires_at = tx.get("expires_at")

        return BillingStatusOut(
            session_id=session_id,
            status=status.status or "unknown",
            payment_status=payment_status or "unknown",
            plan_applied=plan_applied,
            plan=plan_out if plan_applied else None,
            billing_cycle=cycle_out if plan_applied else None,
            expires_at=expires_at,
        )

    # -------- GET /billing/me --------
    @router.get("/me", response_model=MyBillingOut)
    async def get_my_billing(user: Dict[str, Any] = Depends(get_current_user)):
        user_id = user.get("id") or str(user.get("_id"))
        u = await db.users.find_one({"id": user_id}) or {}
        expiry = u.get("plan_expires_at")
        active = bool(u.get("subscription_active"))
        # Auto-deactivate expired plans on read
        if expiry and isinstance(expiry, datetime) and expiry < datetime.utcnow():
            if active:
                await db.users.update_one(
                    {"id": user_id},
                    {"$set": {"subscription_active": False, "plan": "free"}},
                )
                active = False
        return MyBillingOut(
            plan=u.get("plan", "free"),
            plan_expires_at=expiry,
            subscription_active=active,
            billing_cycle=u.get("billing_cycle"),
        )

    # -------- POST /billing/cancel --------
    @router.post("/cancel")
    async def cancel_subscription(user: Dict[str, Any] = Depends(get_current_user)):
        """Cancel auto-renewal. Access remains until `plan_expires_at`."""
        user_id = user.get("id") or str(user.get("_id"))
        u = await db.users.find_one({"id": user_id})
        if not u:
            raise HTTPException(404, "User not found")
        await db.users.update_one(
            {"id": user_id},
            {"$set": {"subscription_active": False, "updated_at": datetime.utcnow()}},
        )
        return {"ok": True, "message": "Subscription cancelled. Access remains until expiry."}

    return router
