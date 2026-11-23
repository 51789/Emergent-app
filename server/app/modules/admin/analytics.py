"""Admin analytics computed with SQL aggregates (date_trunc buckets + generate_series)."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

from sqlalchemy import ColumnElement, and_, case, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.categories import CATEGORY_IDS
from app.core.config import Settings
from app.core.errors import AppError
from app.core.plans import PAID_PLANS, PLANS
from app.db.models import Result, Search, Subscription, User
from app.modules.admin.schemas import (
    CategoriesOut,
    CategoryStat,
    OverviewOut,
    PlanSplit,
    Point,
    RangeOut,
    TimeseriesOut,
)

_PRESETS: dict[str, tuple[timedelta, str]] = {
    "realtime": (timedelta(hours=24), "hour"),
    "7d": (timedelta(days=7), "day"),
    "30d": (timedelta(days=30), "day"),
    "90d": (timedelta(days=90), "week"),
    "180d": (timedelta(days=180), "week"),
    "365d": (timedelta(days=365), "month"),
}
_MAX_CUSTOM_SPAN = timedelta(days=3 * 366)

# Whitelisted SQL fragments per metric (never user input).
_METRIC_SQL = {
    "signups": ("users", "created_at", ""),
    "searches": ("searches", "created_at", ""),
    "subscriptions": ("stripe_events", "created_at", "AND type = 'customer.subscription.created'"),
}


def _invalid_range(message: str) -> AppError:
    return AppError(422, "invalid_range", message)


def _parse_bound(value: str, *, end: bool) -> datetime:
    try:
        if len(value) == 10:  # YYYY-MM-DD: whole days, `to` inclusive
            day = date.fromisoformat(value)
            start = datetime(day.year, day.month, day.day, tzinfo=UTC)
            return start + timedelta(days=1) if end else start
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise _invalid_range(f"Invalid date: {value}") from exc
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def resolve_range(
    key: str, from_: str | None, to: str | None, now: datetime | None = None
) -> tuple[datetime, datetime, str]:
    now = now or datetime.now(UTC)
    if key != "custom":
        delta, bucket = _PRESETS[key]
        return now - delta, now, bucket
    if not from_ or not to:
        raise _invalid_range("`from` and `to` are required for a custom range")
    start, end = _parse_bound(from_, end=False), _parse_bound(to, end=True)
    if start >= end:
        raise _invalid_range("`from` must be before `to`")
    span = end - start
    if span > _MAX_CUSTOM_SPAN:
        raise _invalid_range("Custom ranges are limited to 3 years")
    if span <= timedelta(days=2):
        bucket = "hour"
    elif span <= timedelta(days=60):
        bucket = "day"
    elif span <= timedelta(days=366):
        bucket = "week"
    else:
        bucket = "month"
    return start, end, bucket


def _effective_plan_expr(settings: Settings) -> ColumnElement[str]:
    cutoff = datetime.now(UTC) - timedelta(hours=settings.plan_expiry_grace_hours)
    return case(
        (
            and_(
                User.plan != "free",
                User.plan_expires_at.is_not(None),
                User.plan_expires_at < cutoff,
            ),
            "free",
        ),
        else_=User.plan,
    )


async def overview(
    session: AsyncSession, settings: Settings, start: datetime, end: datetime
) -> OverviewOut:
    in_range = and_(User.created_at >= start, User.created_at < end)
    eff = _effective_plan_expr(settings)

    total_users = int(await session.scalar(select(func.count()).select_from(User)) or 0)
    total_searches = int(await session.scalar(select(func.count()).select_from(Search)) or 0)
    # Conversion = sign-ups in the range that now hold a paying Stripe subscription
    # (manual plan grants by an admin are not conversions).
    paying = select(Subscription.user_id).where(
        Subscription.status.in_(("active", "past_due")), Subscription.plan.in_(PAID_PLANS)
    )
    new_signups, converted = (
        await session.execute(
            select(func.count(), func.count().filter(User.id.in_(paying))).where(in_range)
        )
    ).one()

    split = dict.fromkeys(PLANS, 0)
    for plan, count in (await session.execute(select(eff, func.count()).group_by(eff))).all():
        split[plan] = int(count)

    revenue = 0
    active_subscribers = 0
    rows = await session.execute(
        select(Subscription.plan, Subscription.cycle, func.count())
        .where(Subscription.status == "active", Subscription.plan.in_(PAID_PLANS))
        .group_by(Subscription.plan, Subscription.cycle)
    )
    for plan, cycle, count in rows.all():
        definition = PLANS[plan]
        active_subscribers += int(count)
        if cycle == "yearly" and definition.yearly_cents:
            revenue += int(count) * round(definition.yearly_cents / 12)
        elif definition.monthly_cents:
            revenue += int(count) * definition.monthly_cents

    signups = int(new_signups or 0)
    return OverviewOut(
        range=RangeOut(from_=start, to=end),
        revenue_monthly_estimate_cents=revenue,
        active_subscribers=active_subscribers,
        new_signups=signups,
        conversion_rate=round(int(converted or 0) / signups, 4) if signups else 0.0,
        plan_split=PlanSplit(**split),
        total_users=total_users,
        total_searches=total_searches,
    )


async def timeseries(
    session: AsyncSession, metric: str, start: datetime, end: datetime, bucket: str
) -> TimeseriesOut:
    table, column, extra = _METRIC_SQL[metric]
    # `bucket` comes from a fixed whitelist; the session time zone is UTC (see db/session.py).
    sql = text(
        f"""
        SELECT b.t AS t, count(x.ts) AS value
        FROM generate_series(
            date_trunc('{bucket}', CAST(:start AS timestamptz)),
            date_trunc('{bucket}', CAST(:end AS timestamptz) - interval '1 microsecond'),
            interval '1 {bucket}'
        ) AS b(t)
        LEFT JOIN (
            SELECT date_trunc('{bucket}', {column}) AS ts
            FROM {table}
            WHERE {column} >= CAST(:start AS timestamptz)
              AND {column} < CAST(:end AS timestamptz) {extra}
        ) AS x ON x.ts = b.t
        GROUP BY b.t
        ORDER BY b.t
        """
    )
    rows = await session.execute(sql, {"start": start, "end": end})
    return TimeseriesOut(
        bucket=bucket,  # type: ignore[arg-type]
        points=[Point(t=t, value=int(value)) for t, value in rows.all()],
    )


async def categories(session: AsyncSession, start: datetime, end: datetime) -> CategoriesOut:
    searches = dict(
        (
            await session.execute(
                select(Search.category, func.count())
                .where(Search.created_at >= start, Search.created_at < end)
                .group_by(Search.category)
            )
        ).all()
    )
    results = dict(
        (
            await session.execute(
                select(Result.category, func.count())
                .where(
                    Result.found_at >= start,
                    Result.found_at < end,
                    Result.visible(),
                )
                .group_by(Result.category)
            )
        ).all()
    )
    items = [
        CategoryStat(
            category=cat,  # type: ignore[arg-type]
            searches=int(searches.get(cat, 0)),
            results=int(results.get(cat, 0)),
        )
        for cat in CATEGORY_IDS
    ]
    items.sort(key=lambda i: (i.searches, i.results), reverse=True)
    return CategoriesOut(items=items)
