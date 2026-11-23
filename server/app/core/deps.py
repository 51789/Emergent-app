"""FastAPI dependencies: container, DB session, current user, admin guard."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.container import Container
from app.core.config import Settings
from app.core.errors import AppError, unauthorized
from app.core.security import decode_access_token
from app.db.models import User

_bearer = HTTPBearer(auto_error=False)


def get_container(request: Request) -> Container:
    return request.app.state.container


ContainerDep = Annotated[Container, Depends(get_container)]


def get_settings_dep(request: Request) -> Settings:
    return request.app.state.container.settings


SettingsDep = Annotated[Settings, Depends(get_settings_dep)]


async def get_session(request: Request) -> AsyncIterator[AsyncSession]:
    """One session per request. Services commit explicitly; anything uncommitted is rolled back."""
    async with request.app.state.container.sessionmaker() as session:
        yield session


SessionDep = Annotated[AsyncSession, Depends(get_session)]


async def get_current_user(
    session: SessionDep,
    settings: SettingsDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise unauthorized()
    user_id = decode_access_token(credentials.credentials, settings)
    user = await session.get(User, user_id)
    if user is None:
        raise unauthorized("User no longer exists", code="invalid_token")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


async def require_admin(user: CurrentUser) -> User:
    if user.role != "admin":
        raise AppError(403, "forbidden", "Administrator role required")
    return user


AdminUser = Annotated[User, Depends(require_admin)]
