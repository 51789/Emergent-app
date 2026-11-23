from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.categories import LanguageCode
from app.core.plans import effective_plan
from app.db.models import User

Role = Literal["user", "admin"]
PlanName = Literal["free", "pro", "premium"]
VoiceGender = Literal["female", "male"]


class UserOut(BaseModel):
    id: str
    email: str
    name: str | None
    role: Role
    plan: PlanName
    plan_expires_at: datetime | None
    language: str
    voice_gender: VoiceGender
    auth_providers: list[str]
    created_at: datetime


def user_out(user: User, grace_hours: int = 72) -> UserOut:
    plan = effective_plan(user.plan, user.plan_expires_at, grace_hours)
    return UserOut(
        id=str(user.id),
        email=user.email,
        name=user.name,
        role=user.role,  # type: ignore[arg-type]
        plan=plan,  # type: ignore[arg-type]
        plan_expires_at=user.plan_expires_at if plan != "free" else None,
        language=user.language,
        voice_gender=user.voice_gender,  # type: ignore[arg-type]
        auth_providers=sorted(user.auth_providers or []),
        created_at=user.created_at,
    )


class UpdateMeIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, max_length=200)
    language: LanguageCode | None = None
    voice_gender: VoiceGender | None = None
