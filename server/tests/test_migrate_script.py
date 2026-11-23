from __future__ import annotations

import importlib.util
import uuid
from datetime import datetime
from pathlib import Path

import bcrypt

from app.core.security import verify_password

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "migrate_from_mongo.py"


def _load():
    spec = importlib.util.spec_from_file_location("migrate_from_mongo", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


async def test_map_legacy_user_keeps_bcrypt_hash():
    module = _load()
    legacy_hash = bcrypt.hashpw(b"Legacy.Pass1", bcrypt.gensalt(rounds=4)).decode()
    legacy_id = str(uuid.uuid4())
    row = module.map_user(
        {
            "id": legacy_id,
            "email": "Old@Example.org",
            "hashed_password": legacy_hash,
            "role": "admin",
            "plan": "pro",
            "plan_expires_at": datetime(2030, 1, 1),
            "created_at": "2026-07-23T10:00:00",
            "auth_provider": "google",
        }
    )
    assert row["id"] == uuid.UUID(legacy_id)
    assert row["email"] == "old@example.org"
    assert row["role"] == "admin" and row["plan"] == "pro"
    assert row["plan_expires_at"].tzinfo is not None
    assert row["auth_providers"] == ["password", "google"]
    assert await verify_password("Legacy.Pass1", row["password_hash"])
    assert module.map_user({"email": ""}) is None
    odd = module.map_user({"id": "not-a-uuid", "email": "x@example.org", "plan": "gold"})
    assert odd["plan"] == "free" and isinstance(odd["id"], uuid.UUID)
