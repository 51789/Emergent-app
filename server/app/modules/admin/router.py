from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query, Response, status

from app.core.deps import AdminUser, ContainerDep, SessionDep, SettingsDep
from app.core.ids import parse_id
from app.core.pagination import CursorParam, LimitParam, Page, clamp_limit
from app.modules.admin import analytics, service
from app.modules.admin.schemas import (
    AdminUserCreateIn,
    AdminUserUpdateIn,
    CategoriesOut,
    Metric,
    OverviewOut,
    RangeKey,
    TimeseriesOut,
)
from app.modules.users.schemas import UserOut, user_out

router = APIRouter(prefix="/admin", tags=["admin"])

RangeParam = Annotated[RangeKey, Query()]
FromParam = Annotated[str | None, Query(alias="from")]
ToParam = Annotated[str | None, Query()]


@router.get("/users", response_model=Page[UserOut])
async def list_users(
    _: AdminUser,
    session: SessionDep,
    settings: SettingsDep,
    q: Annotated[str | None, Query(max_length=200)] = None,
    limit: LimitParam = 20,
    cursor: CursorParam = None,
) -> Page[UserOut]:
    return await service.list_users(session, settings, q, clamp_limit(limit), cursor)


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def create_user(
    data: AdminUserCreateIn, _: AdminUser, session: SessionDep, settings: SettingsDep
) -> UserOut:
    user = await service.create_user(session, settings, data)
    return user_out(user, settings.plan_expiry_grace_hours)


@router.patch("/users/{user_id}", response_model=UserOut)
async def update_user(
    user_id: str,
    data: AdminUserUpdateIn,
    admin: AdminUser,
    session: SessionDep,
    settings: SettingsDep,
) -> UserOut:
    user = await service.update_user(session, settings, admin, parse_id(user_id, "User"), data)
    return user_out(user, settings.plan_expiry_grace_hours)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: str, admin: AdminUser, session: SessionDep, container: ContainerDep
) -> Response:
    await service.delete_user(session, admin, parse_id(user_id, "User"), container.billing)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/analytics/overview", response_model=OverviewOut, response_model_by_alias=True)
async def analytics_overview(
    _: AdminUser,
    session: SessionDep,
    settings: SettingsDep,
    range: RangeParam = "30d",
    from_: FromParam = None,
    to: ToParam = None,
) -> OverviewOut:
    start, end, _bucket = analytics.resolve_range(range, from_, to)
    return await analytics.overview(session, settings, start, end)


@router.get("/analytics/timeseries", response_model=TimeseriesOut)
async def analytics_timeseries(
    _: AdminUser,
    session: SessionDep,
    metric: Annotated[Metric, Query()] = "signups",
    range: RangeParam = "30d",
    from_: FromParam = None,
    to: ToParam = None,
) -> TimeseriesOut:
    start, end, bucket = analytics.resolve_range(range, from_, to)
    return await analytics.timeseries(session, metric, start, end, bucket)


@router.get("/analytics/categories", response_model=CategoriesOut)
async def analytics_categories(
    _: AdminUser,
    session: SessionDep,
    range: RangeParam = "30d",
    from_: FromParam = None,
    to: ToParam = None,
) -> CategoriesOut:
    start, end, _bucket = analytics.resolve_range(range, from_, to)
    return await analytics.categories(session, start, end)
