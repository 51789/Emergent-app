from __future__ import annotations

from fastapi import APIRouter, Response, status

from app.core.deps import ContainerDep, SessionDep, SettingsDep
from app.modules.auth.schemas import AuthResponse, GoogleIn, LoginIn, RefreshIn, RegisterIn
from app.modules.auth.service import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register(data: RegisterIn, session: SessionDep, settings: SettingsDep) -> AuthResponse:
    return await AuthService(session, settings).register(data)


@router.post("/login", response_model=AuthResponse)
async def login(data: LoginIn, session: SessionDep, settings: SettingsDep) -> AuthResponse:
    return await AuthService(session, settings).login(data.email, data.password)


@router.post("/google", response_model=AuthResponse)
async def google(data: GoogleIn, session: SessionDep, container: ContainerDep) -> AuthResponse:
    service = AuthService(session, container.settings)
    return await service.login_with_google(container.google_verifier, data.id_token)


@router.post("/refresh", response_model=AuthResponse)
async def refresh(data: RefreshIn, session: SessionDep, settings: SettingsDep) -> AuthResponse:
    return await AuthService(session, settings).refresh(data.refresh_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(data: RefreshIn, session: SessionDep, settings: SettingsDep) -> Response:
    await AuthService(session, settings).logout(data.refresh_token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
