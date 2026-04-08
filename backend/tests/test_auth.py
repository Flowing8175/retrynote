import datetime as _dt_module
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient


@pytest.fixture(autouse=True)
def _mock_turnstile():
    with patch(
        "app.api.auth.verify_turnstile_token", new_callable=AsyncMock, return_value=True
    ):
        yield


@pytest.fixture(autouse=True)
def _patch_datetime_naive():
    with patch("app.api.auth.datetime") as mock_dt:
        mock_dt.now.side_effect = lambda tz=None: _dt_module.datetime.now(
            _dt_module.timezone.utc
        ).replace(tzinfo=None)
        yield


@pytest.fixture(autouse=True)
def _reset_rate_limiter():
    from app.rate_limit import limiter

    limiter._storage.reset()
    yield


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
        assert resp.status_code == 422

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


class TestAntiAbuseSignup:
    @patch("app.api.auth.send_verification_email", new_callable=AsyncMock)
    async def test_signup_disposable_email_blocked(
        self, mock_send_email, client: AsyncClient
    ):
        resp = await client.post(
            "/auth/signup",
            json={
                "username": "spammer",
                "email": "test@mailinator.com",
                "password": "StrongPass123!",
            },
        )
        assert resp.status_code == 400
        mock_send_email.assert_not_called()

    @patch("app.api.auth.send_verification_email", new_callable=AsyncMock)
    async def test_signup_turnstile_bypass_in_dev(
        self, mock_send_email, client: AsyncClient
    ):
        resp = await client.post(
            "/auth/signup",
            json={
                "username": "devbypassuser",
                "email": "devbypass@example.com",
                "password": "StrongPass123!",
                "turnstile_token": "",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "user_id" in data
        assert data["username"] == "devbypassuser"

    @patch("app.api.auth.send_verification_email", new_callable=AsyncMock)
    async def test_signup_creates_unverified_user(
        self, mock_send_email, client: AsyncClient, db_session
    ):
        from sqlalchemy import select
        from app.models import User, EmailVerificationToken

        resp = await client.post(
            "/auth/signup",
            json={
                "username": "newunverified",
                "email": "newunverified@example.com",
                "password": "StrongPass123!",
            },
        )
        assert resp.status_code == 200
        user_id = resp.json()["user_id"]

        user_result = await db_session.execute(select(User).where(User.id == user_id))
        user = user_result.scalar_one_or_none()
        assert user is not None
        assert user.email_verified is False

        token_result = await db_session.execute(
            select(EmailVerificationToken).where(
                EmailVerificationToken.user_id == user_id
            )
        )
        token_record = token_result.scalar_one_or_none()
        assert token_record is not None
        assert token_record.used_at is None

        mock_send_email.assert_called_once()


class TestLoginEmailVerifiedGate:
    async def test_login_unverified_user_blocked(self, client: AsyncClient, db_session):
        from app.models import User, UserRole
        from app.middleware.auth import hash_password

        user = User(
            id=str(uuid.uuid4()),
            username="unverified_user",
            email="unverified@example.com",
            password_hash=hash_password("Pass123!"),
            role=UserRole.user,
            is_active=True,
            email_verified=False,
        )
        db_session.add(user)
        await db_session.commit()

        resp = await client.post(
            "/auth/login",
            json={
                "username_or_email": "unverified_user",
                "password": "Pass123!",
            },
        )
        assert resp.status_code == 403
        data = resp.json()
        assert data["detail"]["code"] == "email_not_verified"

    async def test_login_verified_user_succeeds(self, client: AsyncClient, test_user):
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


class TestEmailVerification:
    async def test_verify_email_valid_token(self, client: AsyncClient, db_session):
        from app.models import User, UserRole, EmailVerificationToken
        from app.middleware.auth import hash_password

        user = User(
            id=str(uuid.uuid4()),
            username="verify_valid",
            email="verify_valid@example.com",
            password_hash=hash_password("Pass123!"),
            role=UserRole.user,
            is_active=True,
            email_verified=False,
        )
        db_session.add(user)
        await db_session.flush()

        token = secrets.token_urlsafe(32)
        selector = token[:16]
        verifier = token[16:]
        verifier_hash = hash_password(verifier)
        verification_token = EmailVerificationToken(
            user_id=user.id,
            selector=selector,
            token_hash=verifier_hash,
            expires_at=datetime.now(timezone.utc) + timedelta(hours=24),
        )
        db_session.add(verification_token)
        await db_session.commit()

        resp = await client.post(
            "/auth/verify-email",
            json={"token": token},
        )
        assert resp.status_code == 200
        assert resp.json() == {"status": "verified"}

        await db_session.refresh(user)
        assert user.email_verified is True

    async def test_verify_email_expired_token(self, client: AsyncClient, db_session):
        from app.models import User, UserRole, EmailVerificationToken
        from app.middleware.auth import hash_password

        user = User(
            id=str(uuid.uuid4()),
            username="verify_expired",
            email="verify_expired@example.com",
            password_hash=hash_password("Pass123!"),
            role=UserRole.user,
            is_active=True,
            email_verified=False,
        )
        db_session.add(user)
        await db_session.flush()

        token = secrets.token_urlsafe(32)
        selector = token[:16]
        verifier = token[16:]
        verifier_hash = hash_password(verifier)
        expired_token = EmailVerificationToken(
            user_id=user.id,
            selector=selector,
            token_hash=verifier_hash,
            expires_at=datetime.now(timezone.utc) - timedelta(hours=1),
        )
        db_session.add(expired_token)
        await db_session.commit()

        resp = await client.post(
            "/auth/verify-email",
            json={"token": token},
        )
        assert resp.status_code == 400

    async def test_verify_email_already_used_token(
        self, client: AsyncClient, db_session
    ):
        from app.models import User, UserRole, EmailVerificationToken
        from app.middleware.auth import hash_password

        user = User(
            id=str(uuid.uuid4()),
            username="verify_used",
            email="verify_used@example.com",
            password_hash=hash_password("Pass123!"),
            role=UserRole.user,
            is_active=True,
            email_verified=True,
        )
        db_session.add(user)
        await db_session.flush()

        token = secrets.token_urlsafe(32)
        selector = token[:16]
        verifier = token[16:]
        verifier_hash = hash_password(verifier)
        used_token = EmailVerificationToken(
            user_id=user.id,
            selector=selector,
            token_hash=verifier_hash,
            expires_at=datetime.now(timezone.utc) + timedelta(hours=24),
            used_at=datetime.now(timezone.utc) - timedelta(hours=1),
        )
        db_session.add(used_token)
        await db_session.commit()

        resp = await client.post(
            "/auth/verify-email",
            json={"token": token},
        )
        assert resp.status_code == 200
        assert resp.json() == {"status": "already_verified"}


class TestResendVerification:
    async def test_resend_verification_unknown_email(self, client: AsyncClient):
        resp = await client.post(
            "/auth/resend-verification",
            json={"email": "nobody@example.com"},
        )
        assert resp.status_code == 200
        assert resp.json() == {"status": "accepted"}

    async def test_resend_verification_already_verified(
        self, client: AsyncClient, test_user
    ):
        resp = await client.post(
            "/auth/resend-verification",
            json={"email": "testuser@example.com"},
        )
        assert resp.status_code == 200
        assert resp.json() == {"status": "accepted"}


class TestSignupDuplicateHandling:
    async def test_signup_pending_verification_returns_409_with_pending_message(
        self, client: AsyncClient, db_session
    ):
        from app.models import User, UserRole, EmailVerificationToken
        from app.middleware.auth import hash_password

        user = User(
            id=str(uuid.uuid4()),
            username="pendinguser",
            email="pending@example.com",
            password_hash=hash_password("TestPass123!"),
            role=UserRole.user,
            email_verified=False,
        )
        db_session.add(user)
        await db_session.flush()
        token_record = EmailVerificationToken(
            user_id=user.id,
            selector="abcdef1234567890",
            token_hash=hash_password("verifier_part"),
            expires_at=datetime.now(timezone.utc) + timedelta(hours=24),
        )
        db_session.add(token_record)
        await db_session.commit()

        resp = await client.post(
            "/auth/signup",
            json={
                "username": "pendinguser",
                "email": "pending@example.com",
                "password": "TestPass123!",
            },
        )
        assert resp.status_code == 409
        assert "인증 대기중" in resp.json()["detail"]

    @patch("app.api.auth.send_verification_email", new_callable=AsyncMock)
    async def test_signup_expired_verification_allows_reregistration(
        self, mock_send_email, client: AsyncClient, db_session
    ):
        from app.models import User, UserRole, EmailVerificationToken
        from app.middleware.auth import hash_password

        user = User(
            id=str(uuid.uuid4()),
            username="expireduser",
            email="expired@example.com",
            password_hash=hash_password("TestPass123!"),
            role=UserRole.user,
            email_verified=False,
        )
        db_session.add(user)
        await db_session.flush()
        old_user_id = user.id
        token_record = EmailVerificationToken(
            user_id=user.id,
            selector="expired123456789a",
            token_hash=hash_password("verifier_part"),
            expires_at=datetime.now(timezone.utc) - timedelta(hours=1),
        )
        db_session.add(token_record)
        await db_session.commit()

        resp = await client.post(
            "/auth/signup",
            json={
                "username": "expireduser",
                "email": "expired@example.com",
                "password": "NewPass123!",
            },
        )
        assert resp.status_code == 200
        new_user_id = resp.json()["user_id"]
        assert new_user_id != old_user_id
        mock_send_email.assert_called_once()

    async def test_signup_verified_user_returns_409_with_already_registered(
        self, client: AsyncClient, test_user
    ):
        resp = await client.post(
            "/auth/signup",
            json={
                "username": "testuser",
                "email": "testuser@example.com",
                "password": "TestPass123!",
            },
        )
        assert resp.status_code == 409
        assert "이미 가입" in resp.json()["detail"]
