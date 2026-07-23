"""
Analytics router for the JARVIS admin dashboard.

This module isolates all `/api/admin/analytics/*` endpoints and their
helpers so `server.py` stays focused on core domain logic.

The router is built via a factory that accepts the shared MongoDB handle
and the admin dependency, avoiding circular imports with `server`.
"""
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query


# ---------- Helpers ----------
def _parse_iso(s: Optional[str]) -> Optional[datetime]:
    """Parse an ISO-8601 datetime string to a naive UTC datetime.
    Accepts YYYY-MM-DD or full ISO with time/zone. Returns None on failure."""
    if not s:
        return None
    try:
        s2 = s.replace("Z", "+00:00")
        dt = datetime.fromisoformat(s2)
        if dt.tzinfo is not None:
            dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
        return dt
    except (ValueError, AttributeError):
        return None


def _resolve_range(
    range_key: str, from_iso: Optional[str], to_iso: Optional[str]
) -> tuple[datetime, datetime, str]:
    """Resolve a (from, to, bucket) tuple based on either a preset key or an
    explicit ISO range. The bucket string is one of 'hour'|'day'|'week'|'month'."""
    now = datetime.utcnow()

    if range_key == "custom":
        f = _parse_iso(from_iso) or (now - timedelta(days=30))
        t = _parse_iso(to_iso) or now
        span_days = max(1, (t - f).days)
        if span_days <= 2:
            bucket = "hour"
        elif span_days <= 60:
            bucket = "day"
        elif span_days <= 365:
            bucket = "week"
        else:
            bucket = "month"
        return f, t, bucket

    presets = {
        "realtime": (timedelta(hours=24), "hour"),
        "week": (timedelta(days=7), "day"),
        "month": (timedelta(days=30), "day"),
        "quarter": (timedelta(days=90), "week"),
        "semester": (timedelta(days=182), "week"),
        "year": (timedelta(days=365), "month"),
    }
    delta, bucket = presets.get(range_key, (timedelta(days=30), "day"))
    return (now - delta), now, bucket


def _bucket_key(dt: datetime, bucket: str) -> str:
    if bucket == "hour":
        return dt.strftime("%Y-%m-%dT%H:00")
    if bucket == "day":
        return dt.strftime("%Y-%m-%d")
    if bucket == "week":
        iso_year, iso_week, _ = dt.isocalendar()
        return f"{iso_year}-W{iso_week:02d}"
    return dt.strftime("%Y-%m")


def _iter_buckets(f: datetime, t: datetime, bucket: str) -> List[str]:
    """Ordered bucket keys between f and t (inclusive), for zero-fill charts."""
    keys: List[str] = []
    if bucket == "hour":
        cur = f.replace(minute=0, second=0, microsecond=0)
        end = t.replace(minute=0, second=0, microsecond=0)
        while cur <= end:
            keys.append(_bucket_key(cur, bucket))
            cur += timedelta(hours=1)
    elif bucket == "day":
        cur = f.replace(hour=0, minute=0, second=0, microsecond=0)
        end = t.replace(hour=0, minute=0, second=0, microsecond=0)
        while cur <= end:
            keys.append(_bucket_key(cur, bucket))
            cur += timedelta(days=1)
    elif bucket == "week":
        start = (f - timedelta(days=f.weekday())).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        end = (t - timedelta(days=t.weekday())).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        cur = start
        while cur <= end:
            keys.append(_bucket_key(cur, bucket))
            cur += timedelta(days=7)
    else:  # month
        cur = f.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        end = t.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        while cur <= end:
            keys.append(_bucket_key(cur, bucket))
            if cur.month == 12:
                cur = cur.replace(year=cur.year + 1, month=1)
            else:
                cur = cur.replace(month=cur.month + 1)
    return keys


PLAN_PRICES: Dict[str, Dict[str, float]] = {
    "pro": {"monthly": 2.99, "annual": 29.99},
    "premium": {"monthly": 4.99, "annual": 49.99},
    "free": {"monthly": 0.0, "annual": 0.0},
}


def build_analytics_router(db, require_admin) -> APIRouter:
    """Build the analytics router with injected shared dependencies.

    Args:
        db: motor.motor_asyncio.AsyncIOMotorDatabase from the main app
        require_admin: FastAPI dependency that returns the current admin user
    """
    router = APIRouter(prefix="/admin/analytics", tags=["analytics"])

    @router.get("/overview")
    async def overview(
        range: str = "month",
        from_: Optional[str] = Query(None, alias="from"),
        to: Optional[str] = None,
        _: Dict[str, Any] = Depends(require_admin),
    ):
        f, t, _bucket = _resolve_range(range, from_, to)

        total_users = await db.users.count_documents({})
        total_admins = await db.users.count_documents({"role": "admin"})
        new_signups = await db.users.count_documents(
            {"created_at": {"$gte": f, "$lte": t}}
        )

        plan_agg = [
            {
                "$group": {
                    "_id": {"plan": "$plan", "status": "$plan_status"},
                    "count": {"$sum": 1},
                }
            }
        ]
        plan_dist: Dict[str, Dict[str, int]] = {}
        async for row in db.users.aggregate(plan_agg):
            plan = (row["_id"].get("plan") or "free").lower()
            status = (row["_id"].get("status") or "inactive").lower()
            plan_dist.setdefault(
                plan, {"active": 0, "inactive": 0, "canceled": 0, "total": 0}
            )
            plan_dist[plan][status] = plan_dist[plan].get(status, 0) + row["count"]
            plan_dist[plan]["total"] += row["count"]

        active_paid_subs = 0
        for p in ("pro", "premium"):
            active_paid_subs += plan_dist.get(p, {}).get("active", 0)

        est_monthly_revenue = 0.0
        for p in ("pro", "premium"):
            active = plan_dist.get(p, {}).get("active", 0)
            est_monthly_revenue += active * PLAN_PRICES[p]["monthly"]

        total_searches = await db.searches.count_documents(
            {"created_at": {"$gte": f, "$lte": t}}
        )
        total_results = await db.results.count_documents(
            {"created_at": {"$gte": f, "$lte": t}}
        )

        paid_in_range = 0
        free_in_range = 0
        async for row in db.users.aggregate(
            [
                {"$match": {"created_at": {"$gte": f, "$lte": t}}},
                {"$group": {"_id": "$plan", "count": {"$sum": 1}}},
            ]
        ):
            plan = (row["_id"] or "free").lower()
            if plan in ("pro", "premium"):
                paid_in_range += row["count"]
            else:
                free_in_range += row["count"]
        total_in_range = paid_in_range + free_in_range
        conversion_rate = (
            (paid_in_range / total_in_range * 100.0) if total_in_range else 0.0
        )

        return {
            "range": range,
            "from": f.isoformat(),
            "to": t.isoformat(),
            "kpis": {
                "total_users": total_users,
                "total_admins": total_admins,
                "new_signups": new_signups,
                "active_paid_subs": active_paid_subs,
                "estimated_monthly_revenue_eur": round(est_monthly_revenue, 2),
                "total_searches": total_searches,
                "total_results": total_results,
                "conversion_rate": round(conversion_rate, 1),
            },
            "plan_distribution": plan_dist,
        }

    @router.get("/timeseries")
    async def timeseries(
        range: str = "month",
        metric: str = "signups",
        from_: Optional[str] = Query(None, alias="from"),
        to: Optional[str] = None,
        _: Dict[str, Any] = Depends(require_admin),
    ):
        if metric not in ("signups", "searches", "results"):
            raise HTTPException(status_code=400, detail="metric non valida")
        f, t, bucket = _resolve_range(range, from_, to)

        collection_map = {
            "signups": db.users,
            "searches": db.searches,
            "results": db.results,
        }
        col = collection_map[metric]

        cursor = col.find(
            {"created_at": {"$gte": f, "$lte": t}},
            {"_id": 0, "created_at": 1},
        )
        counts: Dict[str, int] = {}
        async for doc in cursor:
            ca = doc.get("created_at")
            if not isinstance(ca, datetime):
                ca = _parse_iso(ca) if isinstance(ca, str) else None
            if not ca:
                continue
            key = _bucket_key(ca, bucket)
            counts[key] = counts.get(key, 0) + 1

        ordered_keys = _iter_buckets(f, t, bucket)
        points = [{"label": k, "value": counts.get(k, 0)} for k in ordered_keys]
        total = sum(p["value"] for p in points)

        return {
            "range": range,
            "metric": metric,
            "bucket": bucket,
            "from": f.isoformat(),
            "to": t.isoformat(),
            "total": total,
            "points": points,
        }

    @router.get("/categories")
    async def categories(
        range: str = "month",
        from_: Optional[str] = Query(None, alias="from"),
        to: Optional[str] = None,
        _: Dict[str, Any] = Depends(require_admin),
    ):
        f, t, _b = _resolve_range(range, from_, to)

        pipeline = [
            {"$match": {"created_at": {"$gte": f, "$lte": t}}},
            {"$group": {"_id": "$category", "searches": {"$sum": 1}}},
            {"$sort": {"searches": -1}},
        ]
        per_cat_searches: Dict[str, Dict[str, int]] = {}
        async for row in db.searches.aggregate(pipeline):
            cat = row["_id"] or "unknown"
            per_cat_searches[cat] = {"searches": row["searches"], "results": 0}

        res_pipeline = [
            {"$match": {"created_at": {"$gte": f, "$lte": t}}},
            {
                "$lookup": {
                    "from": "searches",
                    "localField": "search_id",
                    "foreignField": "id",
                    "as": "search",
                }
            },
            {"$unwind": {"path": "$search", "preserveNullAndEmptyArrays": True}},
            {"$group": {"_id": "$search.category", "results": {"$sum": 1}}},
        ]
        async for row in db.results.aggregate(res_pipeline):
            cat = row["_id"] or "unknown"
            entry = per_cat_searches.setdefault(
                cat, {"searches": 0, "results": 0}
            )
            entry["results"] = row["results"]

        items = [
            {"category": k, "searches": v["searches"], "results": v["results"]}
            for k, v in per_cat_searches.items()
        ]
        items.sort(key=lambda x: x["searches"] + x["results"], reverse=True)
        return {
            "range": range,
            "from": f.isoformat(),
            "to": t.isoformat(),
            "items": items,
        }

    return router
