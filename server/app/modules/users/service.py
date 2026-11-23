from __future__ import annotations

import logging

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Subscription, User
from app.modules.billing.gateway import BillingGateway
from app.modules.users.schemas import UpdateMeIn

logger = logging.getLogger(__name__)


async def update_profile(session: AsyncSession, user: User, data: UpdateMeIn) -> User:
    fields = data.model_fields_set
    if "name" in fields:
        user.name = (data.name or "").strip() or None
    if "language" in fields and data.language is not None:
        user.language = data.language
    if "voice_gender" in fields and data.voice_gender is not None:
        user.voice_gender = data.voice_gender
    await session.commit()
    return user


async def delete_account(session: AsyncSession, user: User, billing: BillingGateway | None) -> None:
    """Delete a user and (via ON DELETE CASCADE) all their data.

    An active Stripe subscription is cancelled first (best effort) so the user is not
    billed for an account that no longer exists.
    """
    subscription = (
        await session.execute(select(Subscription).where(Subscription.user_id == user.id))
    ).scalar_one_or_none()
    if (
        billing is not None
        and subscription is not None
        and subscription.stripe_subscription_id
        and subscription.status in ("active", "past_due")
    ):
        try:
            await billing.cancel_subscription(subscription.stripe_subscription_id)
        except Exception:
            logger.exception("Could not cancel Stripe subscription for deleted user %s", user.id)
    await session.execute(delete(User).where(User.id == user.id))
    await session.commit()
