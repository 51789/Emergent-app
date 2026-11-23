"""ORM models. Schema changes must ship with an Alembic migration (alembic/versions)."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ColumnElement,
    Date,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.categories import CATEGORY_IDS, LANGUAGES
from app.db.base import Base, utcnow

PENDING_VERIFICATION = "pending_verification"


def _in(column: str, values: tuple[str, ...]) -> str:
    quoted = ", ".join(f"'{v}'" for v in values)
    return f"{column} IN ({quoted})"


def _uuid_pk() -> Mapped[uuid.UUID]:
    return mapped_column(
        primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )


def _created_at() -> Mapped[datetime]:
    return mapped_column(default=utcnow, server_default=text("now()"))


def _updated_at() -> Mapped[datetime]:
    return mapped_column(default=utcnow, onupdate=utcnow, server_default=text("now()"))


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(_in("role", ("user", "admin")), name="role"),
        CheckConstraint(_in("plan", ("free", "pro", "premium")), name="plan"),
        CheckConstraint(_in("language", LANGUAGES), name="language"),
        CheckConstraint(_in("voice_gender", ("female", "male")), name="voice_gender"),
        Index("ix_users_created_at_id", "created_at", "id"),
        Index("ix_users_role", "role"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    email: Mapped[str] = mapped_column(String(320), unique=True)  # stored lower-cased
    name: Mapped[str | None] = mapped_column(String(200))
    password_hash: Mapped[str | None] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(16), default="user", server_default="user")
    plan: Mapped[str] = mapped_column(String(16), default="free", server_default="free")
    plan_expires_at: Mapped[datetime | None]
    language: Mapped[str] = mapped_column(String(5), default="it", server_default="it")
    voice_gender: Mapped[str] = mapped_column(String(8), default="female", server_default="female")
    auth_providers: Mapped[list[str]] = mapped_column(
        ARRAY(String(16)), default=list, server_default=text("'{}'")
    )
    google_sub: Mapped[str | None] = mapped_column(String(255), unique=True)
    created_at: Mapped[datetime] = _created_at()
    updated_at: Mapped[datetime] = _updated_at()


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[uuid.UUID] = _uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    family_id: Mapped[uuid.UUID] = mapped_column(index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime]
    revoked_at: Mapped[datetime | None]
    replaced_by_id: Mapped[uuid.UUID | None]
    created_at: Mapped[datetime] = _created_at()


class Subscription(Base):
    """Billing state, one row per user (Stripe is the source of truth)."""

    __tablename__ = "subscriptions"
    __table_args__ = (
        CheckConstraint(_in("status", ("active", "canceled", "past_due", "none")), name="status"),
        CheckConstraint("plan IS NULL OR " + _in("plan", ("pro", "premium")), name="plan"),
        CheckConstraint("cycle IS NULL OR " + _in("cycle", ("monthly", "yearly")), name="cycle"),
        Index("ix_subscriptions_status", "status"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    stripe_customer_id: Mapped[str | None] = mapped_column(String(255), unique=True)
    stripe_subscription_id: Mapped[str | None] = mapped_column(String(255), unique=True)
    stripe_price_id: Mapped[str | None] = mapped_column(String(255))
    stripe_status: Mapped[str | None] = mapped_column(String(32))
    plan: Mapped[str | None] = mapped_column(String(16))
    cycle: Mapped[str | None] = mapped_column(String(16))
    status: Mapped[str] = mapped_column(String(16), default="none", server_default="none")
    current_period_end: Mapped[datetime | None]
    cancel_at_period_end: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=text("false")
    )
    created_at: Mapped[datetime] = _created_at()
    updated_at: Mapped[datetime] = _updated_at()


class StripeEvent(Base):
    """Processed webhook events (idempotency + subscription analytics)."""

    __tablename__ = "stripe_events"
    __table_args__ = (Index("ix_stripe_events_type_created", "type", "created_at"),)

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    type: Mapped[str] = mapped_column(String(100))
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    created_at: Mapped[datetime]  # Stripe's event timestamp
    received_at: Mapped[datetime] = _created_at()


class Search(Base):
    __tablename__ = "searches"
    __table_args__ = (
        CheckConstraint(_in("category", CATEGORY_IDS), name="category"),
        CheckConstraint(_in("language", LANGUAGES), name="language"),
        CheckConstraint(
            _in("last_run_status", ("pending", "running", "ok", "error", "no_provider")),
            name="last_run_status",
        ),
        Index("ix_searches_user_category_active", "user_id", "category", "is_active"),
        Index("ix_searches_user_created", "user_id", "created_at", "id"),
        Index("ix_searches_due", "next_run_at", postgresql_where=text("is_active")),
        Index("ix_searches_created_at", "created_at"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    query: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(32))
    language: Mapped[str] = mapped_column(String(5))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"))
    filters: Mapped[dict[str, Any]] = mapped_column(
        JSONB, default=dict, server_default=text("'{}'::jsonb")
    )
    keywords: Mapped[list[str]] = mapped_column(
        ARRAY(Text), default=list, server_default=text("'{}'")
    )
    web_queries: Mapped[list[str]] = mapped_column(
        ARRAY(Text), default=list, server_default=text("'{}'")
    )
    summary: Mapped[str | None] = mapped_column(Text)
    planned_at: Mapped[datetime | None]
    last_run_status: Mapped[str] = mapped_column(
        String(16), default="pending", server_default="pending"
    )
    last_run_at: Mapped[datetime | None]
    last_run_started_at: Mapped[datetime | None]
    last_error: Mapped[str | None] = mapped_column(Text)
    next_run_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = _created_at()
    updated_at: Mapped[datetime] = _updated_at()


class Result(Base):
    __tablename__ = "results"
    __table_args__ = (
        UniqueConstraint("search_id", "url_hash"),
        CheckConstraint(_in("status", ("ATTIVO", "SCADUTO", "SCONOSCIUTO")), name="status"),
        CheckConstraint(_in("source_trust", ("official", "trusted", "other")), name="source_trust"),
        Index("ix_results_user_seen", "user_id", "seen"),
        Index("ix_results_user_favorite", "user_id", "is_favorite"),
        Index("ix_results_user_found", "user_id", "found_at", "id"),
        Index("ix_results_search_found", "search_id", "found_at"),
        Index("ix_results_found_at", "found_at"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    search_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("searches.id", ondelete="CASCADE"))
    # Denormalised for fast per-user queries.
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    category: Mapped[str] = mapped_column(String(32))
    title: Mapped[str] = mapped_column(Text)
    summary: Mapped[str] = mapped_column(Text, default="", server_default="")
    url: Mapped[str] = mapped_column(Text)
    url_hash: Mapped[str] = mapped_column(String(64))
    source_domain: Mapped[str] = mapped_column(String(255))
    image_url: Mapped[str | None] = mapped_column(Text)
    price: Mapped[str | None] = mapped_column(String(120))
    location: Mapped[str | None] = mapped_column(String(255))
    seller_type: Mapped[str | None] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(
        String(16), default="SCONOSCIUTO", server_default="SCONOSCIUTO"
    )
    posted_date: Mapped[date | None] = mapped_column(Date)
    expiry_date: Mapped[date | None] = mapped_column(Date)
    contacts: Mapped[list[str]] = mapped_column(
        ARRAY(Text), default=list, server_default=text("'{}'")
    )
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
    seen: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
    # Page verification (services/verifier.py) and source classification (categories.py).
    verified: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
    verified_at: Mapped[datetime | None]
    source_trust: Mapped[str] = mapped_column(String(16), default="other", server_default="other")
    found_at: Mapped[datetime] = _created_at()
    # Hidden rows keep their (search_id, url_hash) so the same URL is never re-added:
    # user-deleted results and hits the pipeline rejected (irrelevant / expired).
    dismissed_at: Mapped[datetime | None]
    dismiss_reason: Mapped[str | None] = mapped_column(String(32))

    @classmethod
    def pending_verification(cls) -> ColumnElement[bool]:
        """Property hits may be retried until verified or definitively dismissed."""
        retryable = cls.dismissed_at.is_(None) | cls.dismiss_reason.is_not_distinct_from(
            PENDING_VERIFICATION
        )
        return (cls.category == "immobili") & cls.verified.is_(False) & retryable

    @classmethod
    def visible(cls) -> ColumnElement[bool]:
        return cls.dismissed_at.is_(None) & ((cls.category != "immobili") | cls.verified.is_(True))


class PushToken(Base):
    __tablename__ = "push_tokens"
    __table_args__ = (CheckConstraint(_in("platform", ("ios", "android", "web")), name="platform"),)

    id: Mapped[uuid.UUID] = _uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    token: Mapped[str] = mapped_column(String(512), unique=True)
    platform: Mapped[str] = mapped_column(String(16))
    created_at: Mapped[datetime] = _created_at()
    updated_at: Mapped[datetime] = _updated_at()
