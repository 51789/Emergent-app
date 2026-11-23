"""Password hashing (bcrypt), JWT access tokens and opaque refresh tokens."""

from __future__ import annotations

import hashlib
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import bcrypt
import jwt
from anyio import to_thread

from app.core.config import Settings
from app.core.errors import unauthorized

# bcrypt only looks at the first 72 bytes; longer passwords are rejected at the schema level
# so that existing bcrypt hashes (including the ones imported from the legacy app) keep
# verifying with plain bcrypt.
MAX_PASSWORD_BYTES = 72

# A valid hash used to keep login timing similar for unknown emails.
_DUMMY_HASH = bcrypt.hashpw(b"consulens-dummy-password", bcrypt.gensalt(rounds=4))


def _hash_sync(password: str, rounds: int) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=rounds)).decode("ascii")


def _verify_sync(password: str, hashed: str | None) -> bool:
    candidate = hashed.encode("ascii") if hashed else _DUMMY_HASH
    try:
        ok = bcrypt.checkpw(password.encode("utf-8"), candidate)
    except ValueError:
        return False
    return ok and hashed is not None


async def hash_password(password: str, rounds: int) -> str:
    return await to_thread.run_sync(_hash_sync, password, rounds)


async def verify_password(password: str, hashed: str | None) -> bool:
    """Constant-ish time verification. Always runs bcrypt, even when `hashed` is None."""
    return await to_thread.run_sync(_verify_sync, password, hashed)


@dataclass(frozen=True)
class AccessToken:
    token: str
    expires_in: int


def create_access_token(user_id: uuid.UUID, role: str, settings: Settings) -> AccessToken:
    now = datetime.now(UTC)
    ttl = timedelta(minutes=settings.access_token_ttl_minutes)
    payload = {
        "sub": str(user_id),
        "role": role,
        "type": "access",
        "iat": int(now.timestamp()),
        "exp": int((now + ttl).timestamp()),
        "jti": uuid.uuid4().hex,
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return AccessToken(token=token, expires_in=int(ttl.total_seconds()))


def decode_access_token(token: str, settings: Settings) -> uuid.UUID:
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            options={"require": ["exp", "sub"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise unauthorized("Access token expired", code="token_expired") from exc
    except jwt.PyJWTError as exc:
        raise unauthorized("Invalid access token", code="invalid_token") from exc
    if payload.get("type") != "access":
        raise unauthorized("Invalid access token", code="invalid_token")
    try:
        return uuid.UUID(str(payload["sub"]))
    except ValueError as exc:
        raise unauthorized("Invalid access token", code="invalid_token") from exc


def new_refresh_token() -> tuple[str, str]:
    """Return (raw token for the client, sha256 hash to store)."""
    raw = secrets.token_urlsafe(48)
    return raw, hash_refresh_token(raw)


def hash_refresh_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()
