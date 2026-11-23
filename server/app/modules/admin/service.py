"""Admin user management with self-protection and last-admin guards."""

from __future__ import annotations

import uuid

from sqlalchemy import or_, select, tuple_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.errors import AppError, not_found
from app.core.pagination import Page, decode_cursor, encode_cursor, parse_datetime, parse_uuid
from app.core.security import hash_password
from app.db.models import User
from app.modules.admin.schemas import AdminUserCreateIn, AdminUserUpdateIn
from app.modules.auth import repo as auth_repo
from app.modules.billing.gateway import BillingGateway
from app.modules.users.schemas import UserOut, user_out
from app.modules.users.service import delete_account


def _email_taken() -> AppError:
    return AppError(409, "email_taken", "An account with this email already exists")


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


async def _admin_count_locked(session: AsyncSession) -> int:
    """Count admins while locking their rows, so concurrent demotions can't remove the last one."""
    ids = (
        (await session.execute(select(User.id).where(User.role == "admin").with_for_update()))
        .scalars()
        .all()
    )
    return len(ids)


async def list_users(
    session: AsyncSession, settings: Settings, q: str | None, limit: int, cursor: str | None
) -> Page[UserOut]:
    query = select(User)
    if q and q.strip():
        pattern = f"%{_escape_like(q.strip())}%"
        query = query.where(
            or_(User.email.ilike(pattern, escape="\\"), User.name.ilike(pattern, escape="\\"))
        )
    if cursor:
        created_at, uid = decode_cursor(cursor, [parse_datetime, parse_uuid])
        query = query.where(tuple_(User.created_at, User.id) < tuple_(created_at, uid))
    query = query.order_by(User.created_at.desc(), User.id.desc()).limit(limit + 1)
    rows = list((await session.execute(query)).scalars())
    next_cursor = None
    if len(rows) > limit:
        rows = rows[:limit]
        next_cursor = encode_cursor([rows[-1].created_at, rows[-1].id])
    grace = settings.plan_expiry_grace_hours
    return Page[UserOut](items=[user_out(u, grace) for u in rows], next_cursor=next_cursor)


async def create_user(session: AsyncSession, settings: Settings, data: AdminUserCreateIn) -> User:
    email = data.email.lower()
    if await auth_repo.get_user_by_email(session, email) is not None:
        raise _email_taken()
    user = User(
        id=uuid.uuid4(),
        email=email,
        name=(data.name or "").strip() or None,
        password_hash=await hash_password(data.password, settings.bcrypt_rounds),
        role=data.role,
        plan=data.plan,
        auth_providers=["password"],
    )
    session.add(user)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise _email_taken() from exc
    return user


async def update_user(
    session: AsyncSession,
    settings: Settings,
    admin: User,
    user_id: uuid.UUID,
    data: AdminUserUpdateIn,
) -> User:
    target = await session.get(User, user_id)
    if target is None:
        raise not_found("User")
    fields = data.model_fields_set

    if "role" in fields and data.role is not None and data.role != target.role:
        if target.role == "admin":
            if target.id == admin.id:
                raise AppError(400, "cannot_demote_self", "You cannot remove your own admin role")
            if await _admin_count_locked(session) <= 1:
                raise AppError(400, "last_admin", "At least one administrator must remain")
        target.role = data.role
    if "email" in fields and data.email is not None:
        email = data.email.lower()
        if email != target.email:
            if await auth_repo.get_user_by_email(session, email) is not None:
                raise _email_taken()
            target.email = email
    if "password" in fields and data.password is not None:
        target.password_hash = await hash_password(data.password, settings.bcrypt_rounds)
        if "password" not in (target.auth_providers or []):
            target.auth_providers = [*(target.auth_providers or []), "password"]
        await auth_repo.revoke_all_for_user(session, target.id)
    if "name" in fields:
        target.name = (data.name or "").strip() or None
    if "plan" in fields and data.plan is not None:
        target.plan = data.plan
        target.plan_expires_at = None  # manual grant without expiry
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise _email_taken() from exc
    return target


async def delete_user(
    session: AsyncSession, admin: User, user_id: uuid.UUID, billing: BillingGateway | None
) -> None:
    if user_id == admin.id:
        raise AppError(400, "cannot_delete_self", "You cannot delete your own account here")
    target = await session.get(User, user_id)
    if target is None:
        raise not_found("User")
    if target.role == "admin" and await _admin_count_locked(session) <= 1:
        raise AppError(400, "last_admin", "At least one administrator must remain")
    await delete_account(session, target, billing)
