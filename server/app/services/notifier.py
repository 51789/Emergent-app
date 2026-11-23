"""Sends "new results" push notifications to a user's registered devices."""

from __future__ import annotations

import logging
import uuid

from sqlalchemy import delete, select

from app.categories import Category
from app.db.models import PushToken
from app.db.session import SessionMaker
from app.services.push import PushMessage, PushReport, PushSender, is_expo_token

logger = logging.getLogger(__name__)

_MANY_TEMPLATES = {
    "it": "{n} nuovi risultati per «{q}»",
    "en": "{n} new results for “{q}”",
    "es": "{n} nuevos resultados para «{q}»",
    "fr": "{n} nouveaux résultats pour « {q} »",
    "de": "{n} neue Ergebnisse für „{q}“",
}


def build_message_text(
    *, category: Category, language: str, query: str, count: int, first_title: str | None
) -> tuple[str, str]:
    title = f"Consulens · {category.label(language)}"
    if count == 1 and first_title:
        return title, first_title
    template = _MANY_TEMPLATES.get(language, _MANY_TEMPLATES["en"])
    short_query = query if len(query) <= 60 else query[:57] + "..."
    return title, template.format(n=count, q=short_query)


class PushNotifier:
    def __init__(self, sessionmaker: SessionMaker, sender: PushSender | None) -> None:
        self._sm = sessionmaker
        self._sender = sender

    async def notify_new_results(
        self,
        *,
        user_id: uuid.UUID,
        search_id: uuid.UUID,
        category: Category,
        query: str,
        count: int,
        first_title: str | None,
        language: str,
    ) -> PushReport:
        if self._sender is None or count <= 0:
            return PushReport()
        async with self._sm() as session:
            tokens = [
                t
                for t in (
                    await session.execute(
                        select(PushToken.token).where(PushToken.user_id == user_id)
                    )
                ).scalars()
                if is_expo_token(t)
            ]
        if not tokens:
            return PushReport()
        title, body = build_message_text(
            category=category,
            language=language,
            query=query,
            count=count,
            first_title=first_title,
        )
        data = {
            "type": "new_results",
            "search_id": str(search_id),
            "category": category.id,
            "count": count,
        }
        report = await self._sender.send(
            [PushMessage(to=t, title=title, body=body, data=data) for t in tokens]
        )
        if report.invalid_tokens:
            async with self._sm() as session:
                await session.execute(
                    delete(PushToken).where(PushToken.token.in_(report.invalid_tokens))
                )
                await session.commit()
            logger.info("Removed %d unregistered push tokens", len(report.invalid_tokens))
        return report
