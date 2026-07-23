"""Backend tests for JWT auth, admin CRUD, push notifications, and notifications
listing endpoints. Uses the public EXPO_PUBLIC_BACKEND_URL.
"""
import os
import uuid
import pytest
import requests
from pathlib import Path
from dotenv import load_dotenv

# Load frontend/.env to get EXPO_PUBLIC_BACKEND_URL
load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") + "/api"

ADMIN_1 = ("marcolombardo595@gmail.com", "Jarvis.2026")
ADMIN_2 = ("davidepioggia.mx96@gmail.com", "Jarvis.2026")


@pytest.fixture(scope="session")
def s():
    return requests.Session()


def _auth_headers(token: str):
    return {"Authorization": f"Bearer {token}"}


# ---------------- AUTH ----------------
class TestAuth:
    def test_login_admin1_success(self, s):
        r = s.post(f"{BASE}/auth/login", json={"email": ADMIN_1[0], "password": ADMIN_1[1]})
        assert r.status_code == 200, r.text
        d = r.json()
        assert "access_token" in d and d["access_token"]
        assert d["token_type"] == "bearer"
        assert d["user"]["email"] == ADMIN_1[0]
        assert d["user"]["role"] == "admin"
        assert d["user"]["is_active"] is True
        pytest.admin1_token = d["access_token"]
        pytest.admin1_id = d["user"]["id"]

    def test_login_admin2_success(self, s):
        r = s.post(f"{BASE}/auth/login", json={"email": ADMIN_2[0], "password": ADMIN_2[1]})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["user"]["role"] == "admin"
        assert d["user"]["email"] == ADMIN_2[0]
        pytest.admin2_token = d["access_token"]
        pytest.admin2_id = d["user"]["id"]

    def test_login_wrong_password(self, s):
        r = s.post(f"{BASE}/auth/login", json={"email": ADMIN_1[0], "password": "WrongPass!"})
        assert r.status_code == 401

    def test_login_unknown_email(self, s):
        r = s.post(f"{BASE}/auth/login", json={"email": "no-such-user@example.com", "password": "x"})
        assert r.status_code == 401

    def test_register_new_user(self, s):
        email = f"TEST_user_{uuid.uuid4().hex[:8]}@example.com".lower()
        r = s.post(f"{BASE}/auth/register", json={"email": email, "password": "Test1234"})
        assert r.status_code == 201, r.text
        d = r.json()
        pytest.reg_email = email
        pytest.reg_token = d["access_token"]
        pytest.reg_id = d["user"]["id"]
        assert d["user"]["role"] == "user"
        assert d["user"]["plan"] == "free"
        assert d["user"]["email"].lower() == email
        assert d["access_token"]

    def test_register_duplicate_email(self, s):
        r = s.post(f"{BASE}/auth/register", json={"email": pytest.reg_email, "password": "Test1234"})
        assert r.status_code == 400

    def test_me_valid_token(self, s):
        r = s.get(f"{BASE}/auth/me", headers=_auth_headers(pytest.admin1_token))
        assert r.status_code == 200
        d = r.json()
        assert d["email"] == ADMIN_1[0]
        assert d["role"] == "admin"

    def test_me_no_token(self, s):
        r = s.get(f"{BASE}/auth/me")
        assert r.status_code == 401

    def test_me_invalid_token(self, s):
        r = s.get(f"{BASE}/auth/me", headers=_auth_headers("not-a-real-jwt"))
        assert r.status_code == 401

    def test_me_bad_scheme(self, s):
        r = s.get(f"{BASE}/auth/me", headers={"Authorization": pytest.admin1_token})
        assert r.status_code == 401


# ---------------- ADMIN CRUD ----------------
class TestAdmin:
    def test_admin_list_users_ok(self, s):
        r = s.get(f"{BASE}/admin/users", headers=_auth_headers(pytest.admin1_token))
        assert r.status_code == 200
        users = r.json()
        assert isinstance(users, list) and len(users) >= 2
        emails = {u["email"] for u in users}
        assert ADMIN_1[0] in emails and ADMIN_2[0] in emails
        # Verify role/plan fields present
        for u in users:
            assert "role" in u and "plan" in u and "is_active" in u

    def test_admin_list_users_forbidden_for_regular(self, s):
        r = s.get(f"{BASE}/admin/users", headers=_auth_headers(pytest.reg_token))
        assert r.status_code == 403

    def test_admin_create_user_and_verify(self, s):
        email = f"TEST_admin_created_{uuid.uuid4().hex[:8]}@example.com".lower()
        r = s.post(
            f"{BASE}/admin/users",
            headers=_auth_headers(pytest.admin1_token),
            json={"email": email, "password": "Init1234"},
        )
        assert r.status_code == 201, r.text
        d = r.json()
        pytest.created_id = d["id"]
        pytest.created_email = email
        assert d["email"].lower() == email
        assert d["role"] == "user"

        # Verify persistence via list
        r2 = s.get(f"{BASE}/admin/users", headers=_auth_headers(pytest.admin1_token))
        emails = {u["email"].lower() for u in r2.json()}
        assert email in emails

    def test_admin_create_user_duplicate_email(self, s):
        r = s.post(
            f"{BASE}/admin/users",
            headers=_auth_headers(pytest.admin1_token),
            json={"email": pytest.created_email, "password": "abcd1234"},
        )
        assert r.status_code == 400

    def test_admin_patch_role_plan_active_password(self, s):
        # Promote to admin, upgrade plan, deactivate, change password
        new_password = "NewPass9999"
        r = s.patch(
            f"{BASE}/admin/users/{pytest.created_id}",
            headers=_auth_headers(pytest.admin1_token),
            json={
                "role": "admin",
                "plan": "premium",
                "plan_status": "active",
                "is_active": False,
                "password": new_password,
            },
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["role"] == "admin"
        assert d["plan"] == "premium"
        assert d["plan_status"] == "active"
        assert d["is_active"] is False

        # login should now fail (deactivated)
        r_login = s.post(f"{BASE}/auth/login", json={"email": pytest.created_email, "password": new_password})
        assert r_login.status_code == 403

        # Re-activate and confirm new password works
        r2 = s.patch(
            f"{BASE}/admin/users/{pytest.created_id}",
            headers=_auth_headers(pytest.admin1_token),
            json={"is_active": True},
        )
        assert r2.status_code == 200
        r3 = s.post(f"{BASE}/auth/login", json={"email": pytest.created_email, "password": new_password})
        assert r3.status_code == 200

    def test_admin_cannot_demote_self(self, s):
        r = s.patch(
            f"{BASE}/admin/users/{pytest.admin1_id}",
            headers=_auth_headers(pytest.admin1_token),
            json={"role": "user"},
        )
        assert r.status_code == 400

    def test_admin_cannot_disable_self(self, s):
        r = s.patch(
            f"{BASE}/admin/users/{pytest.admin1_id}",
            headers=_auth_headers(pytest.admin1_token),
            json={"is_active": False},
        )
        assert r.status_code == 400

    def test_admin_cannot_delete_self(self, s):
        r = s.delete(
            f"{BASE}/admin/users/{pytest.admin1_id}",
            headers=_auth_headers(pytest.admin1_token),
        )
        assert r.status_code == 400

    def test_admin_delete_other_user(self, s):
        r = s.delete(
            f"{BASE}/admin/users/{pytest.created_id}",
            headers=_auth_headers(pytest.admin1_token),
        )
        assert r.status_code == 200
        # verify gone
        r2 = s.get(f"{BASE}/admin/users", headers=_auth_headers(pytest.admin1_token))
        emails = {u["email"].lower() for u in r2.json()}
        assert pytest.created_email not in emails

    def test_admin_delete_nonexistent(self, s):
        r = s.delete(
            f"{BASE}/admin/users/{uuid.uuid4()}",
            headers=_auth_headers(pytest.admin1_token),
        )
        assert r.status_code == 404


# ---------------- PUSH ----------------
class TestPush:
    def test_register_push_persists_local(self, s):
        uid = f"TEST_user_{uuid.uuid4().hex[:8]}"
        payload = {"user_id": uid, "platform": "android", "device_token": f"tok_{uuid.uuid4().hex}"}
        r = s.post(f"{BASE}/register-push", json=payload)
        assert r.status_code == 201, r.text
        d = r.json()
        assert d["status"] in ("registered", "queued")

    def test_register_push_upsert_same_key(self, s):
        uid = f"TEST_user_{uuid.uuid4().hex[:8]}"
        p1 = {"user_id": uid, "platform": "ios", "device_token": "tok_v1"}
        p2 = {"user_id": uid, "platform": "ios", "device_token": "tok_v2"}
        r1 = s.post(f"{BASE}/register-push", json=p1)
        r2 = s.post(f"{BASE}/register-push", json=p2)
        assert r1.status_code == 201 and r2.status_code == 201
        # both should succeed without duplicate key error (upsert semantics)


# ---------------- NOTIFICATIONS ----------------
class TestNotifications:
    def test_unviewed_list(self, s):
        r = s.get(f"{BASE}/notifications/unviewed")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        # If any items, verify shape includes category/query and no _id
        for item in data[:5]:
            assert "_id" not in item
            assert "id" in item
            # category/query come from the joined search — should exist or be null
            assert "category" in item
            assert "query" in item

    def test_mark_all_viewed(self, s):
        # Ensure at least one unread by processing a search
        create = s.post(
            f"{BASE}/search/process",
            json={"query": "TEST_notif_marker cerco appartamento a Milano 500k", "category": "immobili"},
        )
        # Do not fail on flaky AI — only care that /mark-all-viewed responds
        if create.status_code != 200:
            pytest.skip(f"search/process failed with {create.status_code}, cannot seed unread")
        r = s.post(f"{BASE}/notifications/mark-all-viewed")
        assert r.status_code == 200
        d = r.json()
        assert "updated_count" in d
        assert isinstance(d["updated_count"], int)

        # After marking, unviewed list should be empty
        r2 = s.get(f"{BASE}/notifications/unviewed")
        assert r2.status_code == 200
        assert r2.json() == []


# ---------------- SEARCH PROCESS regression ----------------
class TestSearchProcess:
    def test_search_process_end_to_end(self, s):
        r = s.post(
            f"{BASE}/search/process",
            json={"query": "TEST_e2e cerco monolocale a Roma 200k", "category": "immobili"},
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert "search_id" in d
        assert isinstance(d.get("results", []), list)
        assert len(d["results"]) >= 1
        # Cleanup
        s.delete(f"{BASE}/search/{d['search_id']}")
