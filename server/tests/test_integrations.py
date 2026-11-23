"""Real adapter classes, exercised without network access."""

from __future__ import annotations

import pytest
import stripe

from app.modules.auth.google import GoogleIdTokenVerifier, GoogleTokenError
from app.modules.billing.gateway import StripeGateway
from tests.fakes import sign_stripe_payload, stripe_event

CLIENT_ID = "web-client.apps.googleusercontent.com"


def test_stripe_gateway_verifies_signatures():
    gateway = StripeGateway("sk_test_dummy", "whsec_gateway")
    payload = stripe_event("evt_gw", "invoice.paid", {"id": "in_1"})
    event = gateway.construct_event(payload, sign_stripe_payload(payload, "whsec_gateway"))
    assert event["id"] == "evt_gw" and event["type"] == "invoice.paid"
    with pytest.raises(stripe.SignatureVerificationError):
        gateway.construct_event(payload, sign_stripe_payload(payload, "whsec_other"))
    with pytest.raises(stripe.SignatureVerificationError):
        gateway.construct_event(
            payload, sign_stripe_payload(payload, "whsec_gateway", timestamp=1_000_000)
        )


@pytest.fixture
def claims(monkeypatch):
    holder: dict = {}

    def fake_verify(token, request, audience=None, clock_skew_in_seconds=0):
        holder["audience"] = audience
        if token == "invalid":
            raise ValueError("Token used too late")
        return dict(holder["claims"])

    from google.oauth2 import id_token

    monkeypatch.setattr(id_token, "verify_oauth2_token", fake_verify)
    holder["claims"] = {
        "iss": "https://accounts.google.com",
        "aud": CLIENT_ID,
        "sub": "1234567890",
        "email": "Person@Gmail.com",
        "email_verified": True,
        "name": "Person",
    }
    return holder


async def test_google_verifier_accepts_valid_token(claims):
    verifier = GoogleIdTokenVerifier([CLIENT_ID, "ios-client.apps.googleusercontent.com"])
    identity = await verifier.verify("valid")
    assert identity.email == "person@gmail.com"
    assert identity.sub == "1234567890" and identity.email_verified
    assert claims["audience"] == [CLIENT_ID, "ios-client.apps.googleusercontent.com"]


@pytest.mark.parametrize(
    "override",
    [{"aud": "someone-else"}, {"iss": "https://evil.example"}, {"email": None}],
)
async def test_google_verifier_rejects_bad_claims(claims, override):
    claims["claims"].update(override)
    with pytest.raises(GoogleTokenError):
        await GoogleIdTokenVerifier([CLIENT_ID]).verify("valid")


async def test_google_verifier_rejects_invalid_token(claims):
    with pytest.raises(GoogleTokenError):
        await GoogleIdTokenVerifier([CLIENT_ID]).verify("invalid")


def test_google_verifier_requires_client_ids():
    with pytest.raises(ValueError):
        GoogleIdTokenVerifier([])
