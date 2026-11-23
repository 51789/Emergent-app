from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import jwt
from sqlalchemy import func, select

from app.db.models import PushToken, RefreshToken, Result, Search, User
from app.modules.auth.google import GoogleIdentity
from tests.conftest import register

USER_KEYS = {
    "id",
    "email",
    "name",
    "role",
    "plan",
    "plan_expires_at",
    "language",
    "voice_gender",
    "auth_providers",
    "created_at",
}


async def test_register_returns_auth_response(client):
    response = await client.post(
        "/auth/register",
        json={
            "email": "New.User@Consulens-Test.com",
            "password": "password123",
            "name": "New",
            "language": "en",
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert set(body) == {"access_token", "refresh_token", "token_type", "expires_in", "user"}
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == 30 * 60
    user = body["user"]
    assert set(user) == USER_KEYS
    assert user["email"] == "new.user@consulens-test.com"
    assert user["role"] == "user"
    assert user["plan"] == "free"
    assert user["language"] == "en"
    assert user["voice_gender"] == "female"
    assert user["auth_providers"] == ["password"]
    uuid.UUID(user["id"])
    assert user["created_at"].endswith("Z")


async def test_register_duplicate_and_validation(client):
    await register(client, "dup@consulens-test.com")
    again = await client.post(
        "/auth/register", json={"email": "DUP@consulens-test.com", "password": "password123"}
    )
    assert again.status_code == 409
    assert again.json()["error"]["code"] == "email_taken"

    short = await client.post(
        "/auth/register", json={"email": "x@consulens-test.com", "password": "short"}
    )
    assert short.status_code == 422
    assert short.json()["error"]["code"] == "validation_error"

    too_long = await client.post(
        "/auth/register", json={"email": "y@consulens-test.com", "password": "é" * 40}
    )
    assert too_long.status_code == 422


async def test_login(client):
    await register(client, "login@consulens-test.com", "password123")
    ok = await client.post(
        "/auth/login", json={"email": "LOGIN@consulens-test.com", "password": "password123"}
    )
    assert ok.status_code == 200
    assert ok.json()["user"]["email"] == "login@consulens-test.com"

    bad = await client.post(
        "/auth/login", json={"email": "login@consulens-test.com", "password": "wrong-pass"}
    )
    assert bad.status_code == 401
    assert bad.json()["error"]["code"] == "invalid_credentials"

    unknown = await client.post(
        "/auth/login", json={"email": "ghost@consulens-test.com", "password": "whatever1"}
    )
    assert unknown.status_code == 401


async def test_me_requires_valid_token(client, settings):
    missing = await client.get("/me")
    assert missing.status_code == 401
    assert missing.json() == {
        "error": {"code": "unauthorized", "message": "Authentication required"}
    }

    garbage = await client.get("/me", headers={"Authorization": "Bearer nope"})
    assert garbage.status_code == 401
    assert garbage.json()["error"]["code"] == "invalid_token"

    auth = await register(client)
    expired = jwt.encode(
        {
            "sub": auth["user"]["id"],
            "type": "access",
            "exp": int((datetime.now(UTC) - timedelta(minutes=1)).timestamp()),
        },
        settings.jwt_secret,
        algorithm="HS256",
    )
    response = await client.get("/me", headers={"Authorization": f"Bearer {expired}"})
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "token_expired"

    ok = await client.get("/me", headers=auth["headers"])
    assert ok.status_code == 200
    assert ok.json()["id"] == auth["user"]["id"]


async def test_refresh_rotation_and_reuse_detection(client, sessionmaker):
    auth = await register(client)
    first = auth["refresh_token"]

    rotated = await client.post("/auth/refresh", json={"refresh_token": first})
    assert rotated.status_code == 200
    second = rotated.json()["refresh_token"]
    assert second != first
    assert rotated.json()["access_token"] != auth["access_token"]

    # Re-using the old (rotated) token revokes the whole family.
    reuse = await client.post("/auth/refresh", json={"refresh_token": first})
    assert reuse.status_code == 401
    assert reuse.json()["error"]["code"] == "refresh_token_reused"
    after = await client.post("/auth/refresh", json={"refresh_token": second})
    assert after.status_code == 401

    async with sessionmaker() as session:
        tokens = (await session.execute(select(RefreshToken))).scalars().all()
    assert len(tokens) == 2
    assert all(t.revoked_at is not None for t in tokens)
    # Only hashes are stored.
    assert {t.token_hash for t in tokens}.isdisjoint({first, second})

    invalid = await client.post("/auth/refresh", json={"refresh_token": "not-a-real-token"})
    assert invalid.status_code == 401
    assert invalid.json()["error"]["code"] == "invalid_refresh_token"


async def test_logout_revokes_refresh_token(client):
    auth = await register(client)
    out = await client.post("/auth/logout", json={"refresh_token": auth["refresh_token"]})
    assert out.status_code == 204
    again = await client.post("/auth/refresh", json={"refresh_token": auth["refresh_token"]})
    assert again.status_code == 401
    # Logging out with an unknown token is still a 204 (idempotent).
    unknown = await client.post("/auth/logout", json={"refresh_token": "x" * 30})
    assert unknown.status_code == 204


async def test_google_creates_user(client, fake_google):
    fake_google.identities["tok-new"] = GoogleIdentity(
        sub="google-sub-1", email="g.user@consulens-test.com", email_verified=True, name="G User"
    )
    response = await client.post("/auth/google", json={"id_token": "tok-new" + "x" * 10})
    assert response.status_code == 401  # unknown token

    fake_google.identities["tok-new-xxxxxxxx"] = fake_google.identities.pop("tok-new")
    response = await client.post("/auth/google", json={"id_token": "tok-new-xxxxxxxx"})
    assert response.status_code == 200, response.text
    user = response.json()["user"]
    assert user["email"] == "g.user@consulens-test.com"
    assert user["auth_providers"] == ["google"]
    assert user["name"] == "G User"

    # Same Google account again: same user.
    again = await client.post("/auth/google", json={"id_token": "tok-new-xxxxxxxx"})
    assert again.json()["user"]["id"] == user["id"]


async def test_google_links_existing_password_account(client, fake_google):
    existing = await register(client, "linked@consulens-test.com")
    fake_google.identities["tok-link-xxxxxxx"] = GoogleIdentity(
        sub="google-sub-2", email="linked@consulens-test.com", email_verified=True
    )
    response = await client.post("/auth/google", json={"id_token": "tok-link-xxxxxxx"})
    assert response.status_code == 200
    user = response.json()["user"]
    assert user["id"] == existing["user"]["id"]
    assert user["auth_providers"] == ["google", "password"]
    # Password login still works.
    login = await client.post(
        "/auth/login", json={"email": "linked@consulens-test.com", "password": "password123"}
    )
    assert login.status_code == 200


async def test_google_rejects_unverified_email(client, fake_google):
    fake_google.identities["tok-unverified-x"] = GoogleIdentity(
        sub="google-sub-3", email="unverified@consulens-test.com", email_verified=False
    )
    response = await client.post("/auth/google", json={"id_token": "tok-unverified-x"})
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "email_not_verified"


async def test_patch_me(client):
    auth = await register(client)
    response = await client.patch(
        "/me",
        headers=auth["headers"],
        json={"name": "Mario", "language": "de", "voice_gender": "male"},
    )
    assert response.status_code == 200
    body = response.json()
    assert (body["name"], body["language"], body["voice_gender"]) == ("Mario", "de", "male")

    bad = await client.patch("/me", headers=auth["headers"], json={"role": "admin"})
    assert bad.status_code == 422
    bad_lang = await client.patch("/me", headers=auth["headers"], json={"language": "xx"})
    assert bad_lang.status_code == 422


async def test_delete_me_removes_all_data(client, sessionmaker):
    auth = await register(client, "leaver@consulens-test.com")
    created = await client.post(
        "/searches",
        headers=auth["headers"],
        json={"query": "bilocale Alcamo", "category": "immobili"},
    )
    assert created.status_code == 201
    await client.post(
        "/push-tokens",
        headers=auth["headers"],
        json={"token": "ExponentPushToken[leaver]", "platform": "ios"},
    )

    response = await client.delete("/me", headers=auth["headers"])
    assert response.status_code == 204

    async with sessionmaker() as session:
        for model in (User, Search, Result, PushToken, RefreshToken):
            assert await session.scalar(select(func.count()).select_from(model)) == 0
    assert (await client.get("/me", headers=auth["headers"])).status_code == 401
    login = await client.post(
        "/auth/login", json={"email": "leaver@consulens-test.com", "password": "password123"}
    )
    assert login.status_code == 401
