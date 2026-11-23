from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, StringConstraints

PushTokenText = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=512)
]


class UnseenCountOut(BaseModel):
    count: int


class PushTokenIn(BaseModel):
    token: PushTokenText
    platform: Literal["ios", "android", "web"]
