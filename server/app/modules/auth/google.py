"""Server-side verification of Google ID tokens (Sign in with Google on web/iOS/Android)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from anyio import to_thread

GOOGLE_ISSUERS = ("accounts.google.com", "https://accounts.google.com")


class GoogleTokenError(Exception):
    pass


@dataclass(frozen=True)
class GoogleIdentity:
    sub: str
    email: str
    email_verified: bool
    name: str | None = None


class GoogleVerifier(Protocol):
    async def verify(self, token: str) -> GoogleIdentity: ...


class GoogleIdTokenVerifier:
    """Verifies signature, expiry, issuer and audience using google-auth."""

    def __init__(self, client_ids: list[str]) -> None:
        if not client_ids:
            raise ValueError("At least one Google client id is required")
        self._client_ids = list(client_ids)
        # Imported lazily so the app can boot without the transport being touched.
        import google.auth.transport.requests
        import requests

        self._request = google.auth.transport.requests.Request(session=requests.Session())

    def _verify_sync(self, token: str) -> GoogleIdentity:
        from google.oauth2 import id_token

        try:
            claims = id_token.verify_oauth2_token(token, self._request, audience=self._client_ids)
        except ValueError as exc:  # google-auth raises ValueError for any invalid token
            raise GoogleTokenError(str(exc)) from exc
        if claims.get("iss") not in GOOGLE_ISSUERS:
            raise GoogleTokenError("Wrong issuer")
        if claims.get("aud") not in self._client_ids:
            raise GoogleTokenError("Wrong audience")
        email = claims.get("email")
        if not email:
            raise GoogleTokenError("Token has no email")
        return GoogleIdentity(
            sub=str(claims["sub"]),
            email=str(email).lower(),
            email_verified=bool(claims.get("email_verified")),
            name=claims.get("name"),
        )

    async def verify(self, token: str) -> GoogleIdentity:
        return await to_thread.run_sync(self._verify_sync, token)
