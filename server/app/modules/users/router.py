from __future__ import annotations

from fastapi import APIRouter, Response, status

from app.core.deps import ContainerDep, CurrentUser, SessionDep, SettingsDep
from app.modules.users import service
from app.modules.users.schemas import UpdateMeIn, UserOut, user_out

router = APIRouter(tags=["me"])


@router.get("/me", response_model=UserOut)
async def get_me(user: CurrentUser, settings: SettingsDep) -> UserOut:
    return user_out(user, settings.plan_expiry_grace_hours)


@router.patch("/me", response_model=UserOut)
async def update_me(
    data: UpdateMeIn, user: CurrentUser, session: SessionDep, settings: SettingsDep
) -> UserOut:
    user = await service.update_profile(session, user, data)
    return user_out(user, settings.plan_expiry_grace_hours)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_me(user: CurrentUser, session: SessionDep, container: ContainerDep) -> Response:
    await service.delete_account(session, user, container.billing)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
