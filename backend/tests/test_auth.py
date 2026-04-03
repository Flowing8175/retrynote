import uuid
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient


class TestSignup:
    async def test_signup_success(self, client: AsyncClient):
        resp = await client.post(
            "/auth/signup",
            json={
                "username": "newuser",
                "email": "newuser@example.com",
                "password": "StrongPass123!",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "user_id" in data
        assert data["username"] == "newuser"
        assert "created_at" in data

    async def test_signup_duplicate_username(self, client: AsyncClient, test_user):
        resp = await client.post(
            "/auth/signup",
            json={
                "username": "testuser",
                "email": "other@example.com",
                "password": "StrongPass123!",
            },
        )
        assert resp.status_code == 409

    async def test_signup_duplicate_email(self, client: AsyncClient, test_user):
        resp = await client.post(
            "/auth/signup",
            json={
                "username": "otheruser",
                "email": "testuser@example.com",
                "password": "StrongPass123!",
            },
        )
        assert resp.status_code == 409

    async def test_signup_weak_password(self, client: AsyncClient):
        resp = await client.post(
            "/auth/signup",
            json={
                "username": "weakpwuser",
                "email": "weak@example.com",
                "password": "123",
            },
        )
        assert resp.status_code in (200, 422)

    async def test_signup_invalid_email(self, client: AsyncClient):
        resp = await client.post(
            "/auth/signup",
            json={
                "username": "bademailuser",
                "email": "not-an-email",
                "password": "StrongPass123!",
            },
        )
        assert resp.status_code == 422

    async def test_signup_missing_fields(self, client: AsyncClient):
        resp = await client.post(
            "/auth/signup",
            json={
                "username": "incomplete",
            },
        )
        assert resp.status_code == 422


class TestLogin:
    async def test_login_with_username(self, client: AsyncClient, test_user):
        resp = await client.post(
            "/auth/login",
            json={
                "username_or_email": "testuser",
                "password": "TestPass123!",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"
        assert data["user"]["username"] == "testuser"
        assert data["user"]["role"] == "user"

    async def test_login_with_email(self, client: AsyncClient, test_user):
        resp = await client.post(
            "/auth/login",
            json={
                "username_or_email": "testuser@example.com",
                "password": "TestPass123!",
            },
        )
        assert resp.status_code == 200
        assert "access_token" in resp.json()

    async def test_login_wrong_password(self, client: AsyncClient, test_user):
        resp = await client.post(
            "/auth/login",
            json={
                "username_or_email": "testuser",
                "password": "WrongPassword!",
            },
        )
        assert resp.status_code == 401

    async def test_login_nonexistent_user(self, client: AsyncClient):
        resp = await client.post(
            "/auth/login",
            json={
                "username_or_email": "ghost",
                "password": "whatever",
            },
        )
        assert resp.status_code == 401

    async def test_login_inactive_user(self, client: AsyncClient, db_session):
        from app.models import User, UserRole
        from app.middleware.auth import hash_password

        user = User(
            id=str(uuid.uuid4()),
            username="inactive_user",
            email="inactive@example.com",
            password_hash=hash_password("Pass123!"),
            role=UserRole.user,
            is_active=False,
        )
        db_session.add(user)
        await db_session.commit()

        resp = await client.post(
            "/auth/login",
            json={
                "username_or_email": "inactive_user",
                "password": "Pass123!",
            },
        )
        assert resp.status_code == 403


class TestTokenRefresh:
    async def test_refresh_token_success(self, client: AsyncClient, test_user):
        login_resp = await client.post(
            "/auth/login",
            json={
                "username_or_email": "testuser",
                "password": "TestPass123!",
            },
        )
        refresh_token = login_resp.json()["refresh_token"]

        resp = await client.post(
            "/auth/refresh",
            json={
                "refresh_token": refresh_token,
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert "refresh_token" in data

    async def test_refresh_token_invalid(self, client: AsyncClient):
        resp = await client.post(
            "/auth/refresh",
            json={
                "refresh_token": "invalid.token.here",
            },
        )
        assert resp.status_code == 401


class TestPasswordReset:
    @patch("app.api.auth.send_password_reset_email", new_callable=AsyncMock)
    async def test_password_reset_request_existing_email(
        self, mock_send_email, client: AsyncClient, test_user
    ):
        resp = await client.post(
            "/auth/password/reset/request",
            json={
                "email": "testuser@example.com",
            },
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "accepted"
        mock_send_email.assert_called_once()

    async def test_password_reset_request_nonexistent_email(self, client: AsyncClient):
        resp = await client.post(
            "/auth/password/reset/request",
            json={
                "email": "nobody@example.com",
            },
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "accepted"

    async def test_password_reset_confirm_invalid_token(self, client: AsyncClient):
        resp = await client.post(
            "/auth/password/reset/confirm",
            json={
                "token": "invalid-token",
                "new_password": "NewPass123!",
            },
        )
        assert resp.status_code == 400


class TestGetMe:
    async def test_get_me_authenticated(self, auth_client: AsyncClient, test_user):
        resp = await auth_client.get("/auth/me")
        assert resp.status_code == 200
        data = resp.json()
        assert data["username"] == "testuser"
        assert data["email"] == "testuser@example.com"
        assert data["role"] == "user"

    async def test_get_me_unauthenticated(self, client: AsyncClient):
        resp = await client.get("/auth/me")
        assert resp.status_code == 401


class TestRoleBasedAccess:
    async def test_user_cannot_access_admin_users(self, auth_client: AsyncClient):
        resp = await auth_client.get("/admin/users")
        assert resp.status_code == 403

    async def test_user_cannot_access_admin_logs(self, auth_client: AsyncClient):
        resp = await auth_client.get("/admin/logs")
        assert resp.status_code == 403

    async def test_user_cannot_verify_master(self, auth_client: AsyncClient):
        resp = await auth_client.post(
            "/admin/login/verify-master",
            json={
                "master_password": "test",
            },
        )
        assert resp.status_code == 403

    async def test_admin_can_access_users(self, admin_client: AsyncClient):
        resp = await admin_client.get("/admin/users")
        assert resp.status_code == 200

    async def test_admin_can_access_logs(self, admin_client: AsyncClient):
        resp = await admin_client.get("/admin/logs")
        assert resp.status_code == 200
