from __future__ import annotations

from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, EmailStr, Field

from app.categories import LanguageCode
from app.core.security import MAX_PASSWORD_BYTES
from app.modules.users.schemas import UserOut


def _check_password(value: str) -> str:
    if len(value) < 8:
        raise ValueError("Password must be at least 8 characters")
    if len(value.encode("utf-8")) > MAX_PASSWORD_BYTES:
        raise ValueError(f"Password must be at most {MAX_PASSWORD_BYTES} bytes")
    return value


Password = Annotated[str, AfterValidator(_check_password)]


class RegisterIn(BaseModel):
    email: EmailStr
    password: Password
    name: str | None = Field(default=None, max_length=200)
    language: LanguageCode | None = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(max_length=512)


class GoogleIn(BaseModel):
    id_token: str = Field(min_length=10, max_length=8192)


class RefreshIn(BaseModel):
    refresh_token: str = Field(min_length=10, max_length=512)


class AuthResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int
    user: UserOut
