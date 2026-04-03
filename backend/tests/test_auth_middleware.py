import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest
import pytest_asyncio
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from jose import jwt
from sqlalchemy import select

from app.config import settings
from app.middleware.auth import (
    create_access_token,
    create_admin_token,
    get_current_user,
    require_admin,
    require_admin_verified,
    require_super_admin,
)
from app.models.user import User, UserRole


def _make_credentials(token: str) -> HTTPAuthorizationCredentials:
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


def _make_expired_token(
    user_id: str, role: str = "user", token_type: str = "access"
) -> str:
    expire = datetime.now(timezone.utc) - timedelta(minutes=5)
    return jwt.encode(
        {"sub": user_id, "role": role, "exp": expire, "type": token_type},
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )


def _make_token(
    user_id: str,
    role: str = "user",
    token_type: str = "access",
    expires_delta: timedelta | None = None,
) -> str:
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=30))
    return jwt.encode(
        {"sub": user_id, "role": role, "exp": expire, "type": token_type},
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )


class TestGetCurrentUser:
    async def test_valid_access_token_returns_user(self, db_session, test_user):
        token = create_access_token(test_user.id, test_user.role.value)
        creds = _make_credentials(token)
        user = await get_current_user(credentials=creds, db=db_session)
        assert user.id == test_user.id

    async def test_expired_token_raises_401(self, db_session, test_user):
        token = _make_expired_token(test_user.id)
        creds = _make_credentials(token)
        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(credentials=creds, db=db_session)
        assert exc_info.value.status_code == 401

    async def test_refresh_token_type_raises_401(self, db_session, test_user):
        token = _make_token(test_user.id, token_type="refresh")
        creds = _make_credentials(token)
        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(credentials=creds, db=db_session)
        assert exc_info.value.status_code == 401

    async def test_malformed_token_raises_401(self, db_session):
        creds = _make_credentials("not.a.valid.jwt")
        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(credentials=creds, db=db_session)
        assert exc_info.value.status_code == 401

    async def test_invalid_token_garbage_raises_401(self, db_session):
        creds = _make_credentials("totalgarbage")
        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(credentials=creds, db=db_session)
        assert exc_info.value.status_code == 401

    async def test_deleted_user_raises_401(self, db_session, test_user):
        test_user.deleted_at = datetime.now(timezone.utc)
        db_session.add(test_user)
        await db_session.commit()

        token = create_access_token(test_user.id, test_user.role.value)
        creds = _make_credentials(token)
        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(credentials=creds, db=db_session)
        assert exc_info.value.status_code == 401

    async def test_inactive_user_raises_401(self, db_session, test_user):
        test_user.is_active = False
        db_session.add(test_user)
        await db_session.commit()

        token = create_access_token(test_user.id, test_user.role.value)
        creds = _make_credentials(token)
        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(credentials=creds, db=db_session)
        assert exc_info.value.status_code == 401

    async def test_nonexistent_user_raises_401(self, db_session):
        fake_id = str(uuid.uuid4())
        token = create_access_token(fake_id, "user")
        creds = _make_credentials(token)
        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(credentials=creds, db=db_session)
        assert exc_info.value.status_code == 401


class TestRequireAdmin:
    async def test_admin_user_passes(self, db_session, admin_user):
        result = await require_admin(user=admin_user)
        assert result.id == admin_user.id

    async def test_super_admin_user_passes(self, db_session, super_admin_user):
        result = await require_admin(user=super_admin_user)
        assert result.id == super_admin_user.id

    async def test_regular_user_raises_403(self, db_session, test_user):
        with pytest.raises(HTTPException) as exc_info:
            await require_admin(user=test_user)
        assert exc_info.value.status_code == 403


class TestRequireSuperAdmin:
    async def test_super_admin_passes(self, db_session, super_admin_user):
        result = await require_super_admin(user=super_admin_user)
        assert result.id == super_admin_user.id

    async def test_admin_raises_403(self, db_session, admin_user):
        with pytest.raises(HTTPException) as exc_info:
            await require_super_admin(user=admin_user)
        assert exc_info.value.status_code == 403


class TestRequireAdminVerified:
    async def test_valid_admin_token_passes(self, db_session, admin_user):
        admin_token = create_admin_token(admin_user.id)
        request = MagicMock()
        request.headers = {"X-Admin-Token": admin_token}
        result = await require_admin_verified(request=request, user=admin_user)
        assert result.id == admin_user.id

    async def test_missing_admin_token_raises_403(self, db_session, admin_user):
        request = MagicMock()
        request.headers = {}
        with pytest.raises(HTTPException) as exc_info:
            await require_admin_verified(request=request, user=admin_user)
        assert exc_info.value.status_code == 403

    async def test_expired_admin_token_raises_403(self, db_session, admin_user):
        expired_token = jwt.encode(
            {
                "sub": admin_user.id,
                "role": "admin_verified",
                "exp": datetime.now(timezone.utc) - timedelta(minutes=5),
                "type": "admin",
            },
            settings.jwt_secret_key,
            algorithm=settings.jwt_algorithm,
        )
        request = MagicMock()
        request.headers = {"X-Admin-Token": expired_token}
        with pytest.raises(HTTPException) as exc_info:
            await require_admin_verified(request=request, user=admin_user)
        assert exc_info.value.status_code == 403

    async def test_invalid_admin_token_raises_403(self, db_session, admin_user):
        request = MagicMock()
        request.headers = {"X-Admin-Token": "garbage-token"}
        with pytest.raises(HTTPException) as exc_info:
            await require_admin_verified(request=request, user=admin_user)
        assert exc_info.value.status_code == 403
