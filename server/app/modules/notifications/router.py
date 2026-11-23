from __future__ import annotations

from fastapi import APIRouter, Response, status

from app.core.deps import CurrentUser, SessionDep
from app.modules.notifications import service
from app.modules.notifications.schemas import PushTokenIn, UnseenCountOut
from app.modules.results.service import ResultService

router = APIRouter(tags=["notifications"])


@router.get("/notifications/unseen-count", response_model=UnseenCountOut)
async def unseen_count(session: SessionDep, user: CurrentUser) -> UnseenCountOut:
    return UnseenCountOut(count=await ResultService(session, user).unseen_count())


@router.post("/push-tokens", status_code=status.HTTP_204_NO_CONTENT)
async def register_push_token(
    data: PushTokenIn, session: SessionDep, user: CurrentUser
) -> Response:
    await service.upsert_push_token(session, user.id, data.token, data.platform)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/push-tokens/{token:path}", status_code=status.HTTP_204_NO_CONTENT)
async def unregister_push_token(token: str, session: SessionDep, user: CurrentUser) -> Response:
    await service.delete_push_token(session, user.id, token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
