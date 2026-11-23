"""Expo Push Service client (https://docs.expo.dev/push-notifications/sending-notifications/)."""

from __future__ import annotations

import logging
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any, Protocol

import httpx

logger = logging.getLogger(__name__)

EXPO_CHUNK_SIZE = 100


def is_expo_token(token: str) -> bool:
    return token.startswith(("ExponentPushToken[", "ExpoPushToken[")) and token.endswith("]")


@dataclass(frozen=True)
class PushMessage:
    to: str
    title: str
    body: str
    data: dict[str, Any] = field(default_factory=dict)


@dataclass
class PushReport:
    sent: int = 0
    failed: int = 0
    invalid_tokens: list[str] = field(default_factory=list)


class PushSender(Protocol):
    async def send(self, messages: Sequence[PushMessage]) -> PushReport: ...


class ExpoPushClient:
    def __init__(
        self,
        http: httpx.AsyncClient,
        *,
        url: str = "https://exp.host/--/api/v2/push/send",
        access_token: str | None = None,
        timeout: float = 15.0,
    ) -> None:
        self._http = http
        self._url = url
        self._access_token = access_token
        self._timeout = timeout

    async def send(self, messages: Sequence[PushMessage]) -> PushReport:
        report = PushReport()
        headers = {"Accept": "application/json", "Content-Type": "application/json"}
        if self._access_token:
            headers["Authorization"] = f"Bearer {self._access_token}"

        for start in range(0, len(messages), EXPO_CHUNK_SIZE):
            chunk = list(messages[start : start + EXPO_CHUNK_SIZE])
            payload = [
                {
                    "to": m.to,
                    "title": m.title[:100],
                    "body": m.body[:240],
                    "data": m.data,
                    "sound": "default",
                    "priority": "high",
                }
                for m in chunk
            ]
            try:
                response = await self._http.post(
                    self._url, json=payload, headers=headers, timeout=self._timeout
                )
            except httpx.HTTPError as exc:
                logger.warning("Expo push request failed: %s", exc.__class__.__name__)
                report.failed += len(chunk)
                continue
            if response.status_code >= 400:
                logger.warning("Expo push HTTP %s: %s", response.status_code, response.text[:300])
                report.failed += len(chunk)
                continue
            try:
                tickets = response.json().get("data") or []
            except ValueError:
                report.failed += len(chunk)
                continue
            for message, ticket in zip(chunk, tickets, strict=False):
                if ticket.get("status") == "ok":
                    report.sent += 1
                    continue
                report.failed += 1
                details = ticket.get("details") or {}
                if details.get("error") == "DeviceNotRegistered":
                    report.invalid_tokens.append(message.to)
                else:
                    logger.info("Expo push ticket error: %s", ticket.get("message"))
        return report
