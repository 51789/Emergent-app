from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.categories import CategoryId
from app.modules.auth.schemas import Password
from app.modules.users.schemas import PlanName, Role

RangeKey = Literal["realtime", "7d", "30d", "90d", "180d", "365d", "custom"]
Metric = Literal["signups", "searches", "subscriptions"]
Bucket = Literal["hour", "day", "week", "month"]


class AdminUserCreateIn(BaseModel):
    email: EmailStr
    password: Password
    name: str | None = Field(default=None, max_length=200)
    role: Role = "user"
    plan: PlanName = "free"


class AdminUserUpdateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr | None = None
    password: Password | None = None
    name: str | None = Field(default=None, max_length=200)
    role: Role | None = None
    plan: PlanName | None = None


class RangeOut(BaseModel):
    from_: datetime = Field(serialization_alias="from")
    to: datetime


class PlanSplit(BaseModel):
    free: int
    pro: int
    premium: int


class OverviewOut(BaseModel):
    range: RangeOut
    revenue_monthly_estimate_cents: int
    active_subscribers: int
    new_signups: int
    conversion_rate: float  # fraction 0..1 of the range's sign-ups now on a paid plan
    plan_split: PlanSplit
    total_users: int
    total_searches: int


class Point(BaseModel):
    t: datetime
    value: int


class TimeseriesOut(BaseModel):
    bucket: Bucket
    points: list[Point]


class CategoryStat(BaseModel):
    category: CategoryId
    searches: int
    results: int


class CategoriesOut(BaseModel):
    items: list[CategoryStat]
