from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query, Response, status

from app.categories import CategoryId
from app.core.deps import ContainerDep, CurrentUser, SessionDep
from app.core.ids import parse_id
from app.core.pagination import CursorParam, LimitParam, Page, clamp_limit
from app.modules.results.schemas import (
    MarkAllSeenIn,
    ResultBulkIn,
    ResultOut,
    ResultUpdateIn,
    result_out,
)
from app.modules.results.service import ResultService
from app.modules.searches.schemas import BulkOut
from app.modules.searches.service import SearchService

router = APIRouter(tags=["results"])


@router.get("/searches/{search_id}/results", response_model=Page[ResultOut])
async def search_results(
    search_id: str,
    session: SessionDep,
    container: ContainerDep,
    user: CurrentUser,
    limit: LimitParam = 20,
    cursor: CursorParam = None,
) -> Page[ResultOut]:
    search = await SearchService(session, container.settings, user).get(
        parse_id(search_id, "Search")
    )
    return await ResultService(session, user).list_for_search(
        search.id, limit=clamp_limit(limit), cursor=cursor
    )


@router.get("/results", response_model=Page[ResultOut])
async def list_results(
    session: SessionDep,
    user: CurrentUser,
    favorite: Annotated[bool | None, Query()] = None,
    unseen: Annotated[bool | None, Query()] = None,
    category: Annotated[CategoryId | None, Query()] = None,
    limit: LimitParam = 20,
    cursor: CursorParam = None,
) -> Page[ResultOut]:
    return await ResultService(session, user).list_feed(
        favorite=favorite,
        unseen=unseen,
        category=category,
        limit=clamp_limit(limit),
        cursor=cursor,
    )


@router.post("/results/bulk", response_model=BulkOut)
async def bulk_results(data: ResultBulkIn, session: SessionDep, user: CurrentUser) -> BulkOut:
    return BulkOut(affected=await ResultService(session, user).bulk(data.ids, data.action))


@router.post("/results/mark-all-seen", response_model=BulkOut)
async def mark_all_seen(
    data: MarkAllSeenIn, session: SessionDep, container: ContainerDep, user: CurrentUser
) -> BulkOut:
    search_id = None
    if data.search_id is not None:
        search = await SearchService(session, container.settings, user).get(
            parse_id(data.search_id, "Search")
        )
        search_id = search.id
    return BulkOut(affected=await ResultService(session, user).mark_all_seen(search_id))


@router.patch("/results/{result_id}", response_model=ResultOut)
async def update_result(
    result_id: str, data: ResultUpdateIn, session: SessionDep, user: CurrentUser
) -> ResultOut:
    result = await ResultService(session, user).update(
        parse_id(result_id, "Result"), is_favorite=data.is_favorite, seen=data.seen
    )
    return result_out(result)


@router.delete("/results/{result_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_result(result_id: str, session: SessionDep, user: CurrentUser) -> Response:
    await ResultService(session, user).delete(parse_id(result_id, "Result"))
    return Response(status_code=status.HTTP_204_NO_CONTENT)
