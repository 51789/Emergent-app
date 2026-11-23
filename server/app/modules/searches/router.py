from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Query, Response, status

from app.categories import CategoryId
from app.core.deps import ContainerDep, CurrentUser, SessionDep
from app.core.ids import parse_id
from app.core.pagination import CursorParam, LimitParam, Page, clamp_limit
from app.modules.searches.schemas import (
    BulkOut,
    CategoryCount,
    SearchBulkIn,
    SearchCreateIn,
    SearchOut,
    SearchUpdateIn,
)
from app.modules.searches.service import SearchService

router = APIRouter(prefix="/searches", tags=["searches"])


def _service(session: SessionDep, container: ContainerDep, user: CurrentUser) -> SearchService:
    return SearchService(session, container.settings, user)


@router.get("", response_model=Page[SearchOut])
async def list_searches(
    session: SessionDep,
    container: ContainerDep,
    user: CurrentUser,
    category: Annotated[CategoryId | None, Query()] = None,
    is_active: Annotated[bool | None, Query()] = None,
    limit: LimitParam = 20,
    cursor: CursorParam = None,
) -> Page[SearchOut]:
    return await _service(session, container, user).list(
        category=category, is_active=is_active, limit=clamp_limit(limit), cursor=cursor
    )


@router.post("", response_model=SearchOut, status_code=status.HTTP_201_CREATED)
async def create_search(
    data: SearchCreateIn,
    background: BackgroundTasks,
    session: SessionDep,
    container: ContainerDep,
    user: CurrentUser,
) -> SearchOut:
    service = _service(session, container, user)
    search = await service.create(data)
    out = await service.one_out(search)
    background.add_task(container.pipeline.run, search.id, trigger="initial")
    return out


@router.get("/counts", response_model=dict[str, CategoryCount])
async def search_counts(
    session: SessionDep, container: ContainerDep, user: CurrentUser
) -> dict[str, CategoryCount]:
    return await _service(session, container, user).counts()


@router.post("/bulk", response_model=BulkOut)
async def bulk_searches(
    data: SearchBulkIn, session: SessionDep, container: ContainerDep, user: CurrentUser
) -> BulkOut:
    affected = await _service(session, container, user).bulk(data.ids, data.action)
    return BulkOut(affected=affected)


@router.get("/{search_id}", response_model=SearchOut)
async def get_search(
    search_id: str, session: SessionDep, container: ContainerDep, user: CurrentUser
) -> SearchOut:
    service = _service(session, container, user)
    return await service.one_out(await service.get(parse_id(search_id, "Search")))


@router.patch("/{search_id}", response_model=SearchOut)
async def update_search(
    search_id: str,
    data: SearchUpdateIn,
    session: SessionDep,
    container: ContainerDep,
    user: CurrentUser,
) -> SearchOut:
    service = _service(session, container, user)
    sid = parse_id(search_id, "Search")
    search = (
        await service.set_active(sid, data.is_active)
        if data.is_active is not None
        else await service.get(sid)
    )
    return await service.one_out(search)


@router.delete("/{search_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_search(
    search_id: str, session: SessionDep, container: ContainerDep, user: CurrentUser
) -> Response:
    await _service(session, container, user).delete(parse_id(search_id, "Search"))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{search_id}/run", response_model=SearchOut, status_code=status.HTTP_202_ACCEPTED)
async def run_search(
    search_id: str,
    background: BackgroundTasks,
    session: SessionDep,
    container: ContainerDep,
    user: CurrentUser,
) -> SearchOut:
    service = _service(session, container, user)
    search = await service.request_run(parse_id(search_id, "Search"))
    out = await service.one_out(search)
    background.add_task(container.pipeline.run, search.id, trigger="manual")
    return out
