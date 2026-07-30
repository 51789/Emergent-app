"""
Emergent-managed Google Auth router.

Flow
----
1. Frontend redirects the user to `https://auth.emergentagent.com/?redirect=<url>`.
2. Emergent returns to the app with `session_id=<one-time>` in the URL.
3. Frontend calls Emergent's `session-data` endpoint with `X-Session-ID` to
   exchange the one-time `session_id` for a long-lived `session_token` plus
   user profile.
4. Frontend POSTs `{ session_token }` to **this** backend endpoint. We:
     - Verify the token again with Emergent (defense in depth — never trust the
       client).
     - Upsert the user by email in `users` collection.
     - Store a record in `user_sessions` with 7-day expiry.
     - Return `{ access_token: session_token, user: ... }`.
5. `get_current_user()` in `server.py` accepts both legacy JWTs and Google
   session_tokens (via `user_sessions` lookup).
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, Optional

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, EmailStr
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)

EMERGENT_SESSION_URL = (
    "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"
)
SESSION_DURATION_DAYS = 7


class GoogleSessionIn(BaseModel):
    session_token: str


class UserOut(BaseModel):
    id: str
    email: EmailStr
    role: str
    is_active: bool = True
    plan: Optional[str] = "free"
    plan_status: Optional[str] = "inactive"
    plan_expires_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    name: Optional[str] = None
    picture: Optional[str] = None


class GoogleSessionOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


def _user_out(u: Dict[str, Any]) -> UserOut:
    return UserOut(
        id=u.get("id"),
        email=u.get("email"),
        role=u.get("role", "user"),
        is_active=u.get("is_active", True),
        plan=u.get("plan", "free"),
        plan_status=u.get("plan_status", "inactive"),
        plan_expires_at=u.get("plan_expires_at"),
        created_at=u.get("created_at"),
        name=u.get("name"),
        picture=u.get("picture"),
    )


async def _verify_with_emergent(session_token: str) -> Dict[str, Any]:
    """Call Emergent's session-data API. Raises 401 on failure."""
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                EMERGENT_SESSION_URL,
                headers={"X-Session-ID": session_token},
            )
    except httpx.HTTPError as e:
        logger.warning("Emergent session verify failed: %s", e)
        raise HTTPException(502, "Auth provider unreachable")

    if resp.status_code != 200:
        logger.info("Emergent rejected session_token (%s)", resp.status_code)
        raise HTTPException(401, "Invalid Google session")

    try:
        data = resp.json()
    except ValueError:
        raise HTTPException(502, "Malformed response from auth provider")
    if not data.get("email"):
        raise HTTPException(401, "Missing email in auth response")
    return data


def build_google_auth_router(db: AsyncIOMotorDatabase) -> APIRouter:
    """Build the /auth/google/* router. Mounted under /api by server.py."""
    router = APIRouter(prefix="/auth", tags=["auth-google"])

    async def _ensure_indexes():
        try:
            await db.user_sessions.create_index("session_token", unique=True)
            await db.user_sessions.create_index("user_id")
            # TTL: MongoDB removes docs when now > expires_at
            await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
        except Exception as e:
            logger.warning("user_sessions index setup failed: %s", e)

    # Idempotently set up indexes on router creation
    # (Motor is async; we schedule the task via the running event loop lazily)
    import asyncio
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.ensure_future(_ensure_indexes())
        else:
            loop.run_until_complete(_ensure_indexes())
    except Exception:
        pass

    @router.post("/google/session", response_model=GoogleSessionOut)
    async def google_session(body: GoogleSessionIn):
        """Exchange an Emergent session_token for an app session."""
        emergent = await _verify_with_emergent(body.session_token)
        email = (emergent.get("email") or "").lower().strip()
        if not email:
            raise HTTPException(401, "No email in Google session")

        name = emergent.get("name")
        picture = emergent.get("picture")

        # Upsert user by email — never create duplicates.
        existing = await db.users.find_one({"email": email}, {"_id": 0})
        now = datetime.utcnow()
        if existing:
            uid = existing["id"]
            update_fields = {
                "last_login_at": now,
                "auth_provider": existing.get("auth_provider") or "google",
            }
            # Fill in profile enrichments if missing
            if name and not existing.get("name"):
                update_fields["name"] = name
            if picture and not existing.get("picture"):
                update_fields["picture"] = picture
            await db.users.update_one({"id": uid}, {"$set": update_fields})
            user_doc = {**existing, **update_fields}
            if not user_doc.get("is_active", True):
                raise HTTPException(403, "Account disattivato")
        else:
            uid = f"user_{uuid.uuid4().hex[:12]}"
            user_doc = {
                "id": uid,
                "email": email,
                # Google users have no local password
                "hashed_password": None,
                "role": "user",
                "is_active": True,
                "plan": "free",
                "plan_status": "inactive",
                "plan_started_at": None,
                "plan_expires_at": None,
                "name": name,
                "picture": picture,
                "auth_provider": "google",
                "created_at": now,
                "last_login_at": now,
            }
            await db.users.insert_one(user_doc)

        # Persist session (7 days, TZ-aware)
        expires_at = datetime.now(timezone.utc) + timedelta(days=SESSION_DURATION_DAYS)
        await db.user_sessions.update_one(
            {"session_token": body.session_token},
            {
                "$set": {
                    "session_token": body.session_token,
                    "user_id": uid,
                    "expires_at": expires_at,
                    "updated_at": datetime.now(timezone.utc),
                },
                "$setOnInsert": {
                    "created_at": datetime.now(timezone.utc),
                },
            },
            upsert=True,
        )

        return GoogleSessionOut(
            access_token=body.session_token,
            user=_user_out(user_doc),
        )

    @router.post("/logout")
    async def logout(authorization: Optional[str] = Header(None)):
        """Invalidate the Google session_token (no-op for JWTs)."""
        if not authorization or not authorization.lower().startswith("bearer "):
            return {"ok": True}
        token = authorization.split(None, 1)[1].strip()
        try:
            await db.user_sessions.delete_one({"session_token": token})
        except Exception:
            pass
        return {"ok": True}

    return router


async def get_user_from_session_token(
    db: AsyncIOMotorDatabase, session_token: str
) -> Optional[Dict[str, Any]]:
    """Look up an active session_token and return the user document.
    Returns None if the token is unknown, expired, or the user is inactive.
    """
    if not session_token:
        return None
    sess = await db.user_sessions.find_one({"session_token": session_token}, {"_id": 0})
    if not sess:
        return None
    exp = sess.get("expires_at")
    if exp:
        # Normalize naive datetimes returned by MongoDB
        if isinstance(exp, datetime) and exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if isinstance(exp, datetime) and exp < datetime.now(timezone.utc):
            await db.user_sessions.delete_one({"session_token": session_token})
            return None
    user = await db.users.find_one({"id": sess["user_id"]}, {"_id": 0})
    if not user or not user.get("is_active", True):
        return None
    return user
