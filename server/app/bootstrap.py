"""Create the first administrator from env vars, only when no admin exists yet."""

from __future__ import annotations

import logging
import uuid

from sqlalchemy import select, text

from app.core.config import Settings
from app.core.security import MAX_PASSWORD_BYTES, hash_password
from app.db.models import User
from app.db.session import SessionMaker
from app.modules.auth import repo as auth_repo

logger = logging.getLogger(__name__)

_BOOTSTRAP_LOCK_KEY = 72_310_001  # arbitrary constant for pg_advisory_xact_lock


async def bootstrap_admin(sessionmaker: SessionMaker, settings: Settings) -> bool:
    """Returns True when an admin was created or promoted."""
    email = (settings.bootstrap_admin_email or "").strip().lower()
    password = settings.bootstrap_admin_password or ""
    if not email or not password:
        return False
    if len(password) < 12 or len(password.encode()) > MAX_PASSWORD_BYTES:
        logger.error("BOOTSTRAP_ADMIN_PASSWORD must be 12-72 bytes; admin bootstrap skipped")
        return False

    async with sessionmaker() as session:
        # Serialise concurrent API replicas starting at the same time.
        await session.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": _BOOTSTRAP_LOCK_KEY})
        if await session.scalar(select(User.id).where(User.role == "admin").limit(1)):
            return False
        password_hash = await hash_password(password, settings.bcrypt_rounds)
        user = await auth_repo.get_user_by_email(session, email)
        if user is None:
            session.add(
                User(
                    id=uuid.uuid4(),
                    email=email,
                    password_hash=password_hash,
                    role="admin",
                    plan="premium",
                    auth_providers=["password"],
                )
            )
        else:
            # Reset the password too: otherwise whoever registered this email first would
            # silently become admin with their own password.
            user.role = "admin"
            user.password_hash = password_hash
            if "password" not in (user.auth_providers or []):
                user.auth_providers = [*(user.auth_providers or []), "password"]
            await auth_repo.revoke_all_for_user(session, user.id)
        await session.commit()
    logger.info("Bootstrap administrator %s is ready", email)
    return True
