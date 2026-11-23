"""Registration, login (password / Google), refresh-token rotation with reuse detection."""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.errors import AppError, unauthorized
from app.core.security import (
    create_access_token,
    hash_password,
    hash_refresh_token,
    new_refresh_token,
    verify_password,
)
from app.db.models import RefreshToken, User
from app.modules.auth import repo
from app.modules.auth.google import GoogleTokenError, GoogleVerifier
from app.modules.auth.schemas import AuthResponse, RegisterIn
from app.modules.users.schemas import user_out

logger = logging.getLogger(__name__)


def _email_taken() -> AppError:
    return AppError(409, "email_taken", "An account with this email already exists")


class AuthService:
    def __init__(self, session: AsyncSession, settings: Settings) -> None:
        self.session = session
        self.settings = settings

    async def _issue(
        self, user: User, family_id: uuid.UUID | None = None
    ) -> tuple[AuthResponse, RefreshToken]:
        raw, digest = new_refresh_token()
        token = RefreshToken(
            id=uuid.uuid4(),
            user_id=user.id,
            family_id=family_id or uuid.uuid4(),
            token_hash=digest,
            expires_at=datetime.now(UTC) + timedelta(days=self.settings.refresh_token_ttl_days),
        )
        self.session.add(token)
        access = create_access_token(user.id, user.role, self.settings)
        response = AuthResponse(
            access_token=access.token,
            refresh_token=raw,
            expires_in=access.expires_in,
            user=user_out(user, self.settings.plan_expiry_grace_hours),
        )
        return response, token

    async def register(self, data: RegisterIn) -> AuthResponse:
        email = data.email.lower()
        if await repo.get_user_by_email(self.session, email) is not None:
            raise _email_taken()
        user = User(
            id=uuid.uuid4(),
            email=email,
            name=(data.name or "").strip() or None,
            password_hash=await hash_password(data.password, self.settings.bcrypt_rounds),
            language=data.language or "it",
            auth_providers=["password"],
        )
        self.session.add(user)
        try:
            await self.session.flush()
        except IntegrityError as exc:
            await self.session.rollback()
            raise _email_taken() from exc
        response, _ = await self._issue(user)
        await self.session.commit()
        return response

    async def login(self, email: str, password: str) -> AuthResponse:
        user = await repo.get_user_by_email(self.session, email)
        valid = await verify_password(password, user.password_hash if user else None)
        if user is None or not valid:
            raise unauthorized("Invalid email or password", code="invalid_credentials")
        response, _ = await self._issue(user)
        await self.session.commit()
        return response

    async def login_with_google(
        self, verifier: GoogleVerifier | None, id_token: str
    ) -> AuthResponse:
        if verifier is None:
            raise AppError(503, "google_auth_not_configured", "Google sign-in is not configured")
        try:
            identity = await verifier.verify(id_token)
        except GoogleTokenError as exc:
            raise unauthorized("Invalid Google ID token", code="invalid_google_token") from exc
        if not identity.email_verified:
            raise unauthorized("Google account email is not verified", code="email_not_verified")

        user = await repo.get_user_by_google_sub(self.session, identity.sub)
        if user is None:
            user = await repo.get_user_by_email(self.session, identity.email)
            if user is not None and user.google_sub and user.google_sub != identity.sub:
                raise AppError(
                    409, "account_conflict", "This email is linked to a different Google account"
                )
        if user is None:
            user = User(
                id=uuid.uuid4(),
                email=identity.email,
                name=identity.name,
                auth_providers=["google"],
                google_sub=identity.sub,
            )
            self.session.add(user)
        else:
            user.google_sub = identity.sub
            if "google" not in (user.auth_providers or []):
                user.auth_providers = [*(user.auth_providers or []), "google"]
            if not user.name and identity.name:
                user.name = identity.name
        try:
            await self.session.flush()
        except IntegrityError as exc:
            await self.session.rollback()
            raise AppError(409, "account_conflict", "Could not link the Google account") from exc
        response, _ = await self._issue(user)
        await self.session.commit()
        return response

    async def refresh(self, raw_token: str) -> AuthResponse:
        now = datetime.now(UTC)
        token = await repo.get_refresh_token_for_update(self.session, hash_refresh_token(raw_token))
        if token is None:
            raise unauthorized("Invalid refresh token", code="invalid_refresh_token")
        if token.revoked_at is not None:
            # A rotated/revoked token was presented again: assume theft, kill the family.
            await repo.revoke_family(self.session, token.family_id)
            await self.session.commit()
            logger.warning("Refresh token reuse detected for user %s", token.user_id)
            raise unauthorized("Refresh token reuse detected", code="refresh_token_reused")
        if token.expires_at <= now:
            raise unauthorized("Refresh token expired", code="refresh_token_expired")
        user = await self.session.get(User, token.user_id)
        if user is None:
            raise unauthorized("Invalid refresh token", code="invalid_refresh_token")
        response, new_token = await self._issue(user, family_id=token.family_id)
        token.revoked_at = now
        token.replaced_by_id = new_token.id
        await self.session.commit()
        return response

    async def logout(self, raw_token: str) -> None:
        token = await repo.get_refresh_token_for_update(self.session, hash_refresh_token(raw_token))
        if token is not None:
            await repo.revoke_family(self.session, token.family_id)
            await self.session.commit()
