"""Tests for GuestSessionService."""
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest
from sqlalchemy import select

from app.models.guest import GuestSession
from app.services.guest_session_service import GuestSessionService


class TestCreateGuestSession:
    async def test_create_guest_session(self, db_session):
        token = str(uuid.uuid4())
        session = await GuestSessionService.create_guest_session(db_session, token, "127.0.0.1")
        await db_session.commit()

        assert session.session_token == token
        assert session.ip_address == "127.0.0.1"
        assert session.is_deleted is False
        assert session.converted_user_id is None

    async def test_get_or_create_idempotent(self, db_session):
        token = str(uuid.uuid4())
        s1 = await GuestSessionService.get_or_create(db_session, token, "10.0.0.1")
        await db_session.commit()
        s2 = await GuestSessionService.get_or_create(db_session, token, "10.0.0.2")
        await db_session.commit()

        assert s1.id == s2.id
        # IP should not change on second call
        assert s2.ip_address == "10.0.0.1"

    async def test_get_guest_session_not_found(self, db_session):
        result = await GuestSessionService.get_guest_session(db_session, "nonexistent-token")
        assert result is None

    async def test_get_guest_session_deleted_returns_none(self, db_session):
        token = str(uuid.uuid4())
        session = GuestSession(
            session_token=token,
            ip_address="1.2.3.4",
            is_deleted=True,
            last_activity_at=datetime.now(timezone.utc),
        )
        db_session.add(session)
        await db_session.commit()

        result = await GuestSessionService.get_guest_session(db_session, token)
        assert result is None


class TestValidateGuestSession:
    async def test_validate_session_expired(self, db_session):
        from fastapi import HTTPException

        token = str(uuid.uuid4())
        old_time = datetime.now(timezone.utc) - timedelta(hours=25)
        session = GuestSession(
            session_token=token,
            ip_address="1.2.3.4",
            is_deleted=False,
            last_activity_at=old_time,
        )
        db_session.add(session)
        await db_session.commit()

        with pytest.raises(HTTPException) as exc_info:
            await GuestSessionService.validate_guest_session(db_session, token)
        assert exc_info.value.status_code == 410

    async def test_validate_session_fresh(self, db_session):
        token = str(uuid.uuid4())
        session = await GuestSessionService.create_guest_session(db_session, token, "1.2.3.4")
        # Ensure last_activity_at is recent
        session.last_activity_at = datetime.now(timezone.utc)
        await db_session.commit()

        result = await GuestSessionService.validate_guest_session(db_session, token)
        assert result.id == session.id

    async def test_validate_session_not_found_raises_404(self, db_session):
        from fastapi import HTTPException

        with pytest.raises(HTTPException) as exc_info:
            await GuestSessionService.validate_guest_session(db_session, "bogus-token")
        assert exc_info.value.status_code == 404


class TestUpdateActivity:
    async def test_update_activity(self, db_session):
        token = str(uuid.uuid4())
        session = GuestSession(
            session_token=token,
            ip_address="1.2.3.4",
            is_deleted=False,
            last_activity_at=datetime.now(timezone.utc) - timedelta(hours=2),
        )
        db_session.add(session)
        await db_session.commit()

        before = session.last_activity_at.replace(tzinfo=timezone.utc) if session.last_activity_at.tzinfo is None else session.last_activity_at
        await GuestSessionService.update_activity(db_session, token)
        await db_session.commit()
        await db_session.refresh(session)

        after = session.last_activity_at.replace(tzinfo=timezone.utc) if session.last_activity_at.tzinfo is None else session.last_activity_at
        assert after > before


class TestMarkConverted:
    async def test_mark_converted(self, db_session, test_user):
        token = str(uuid.uuid4())
        session = await GuestSessionService.create_guest_session(db_session, token, "1.2.3.4")
        await db_session.commit()

        await GuestSessionService.mark_converted(db_session, token, test_user.id)
        await db_session.commit()
        await db_session.refresh(session)

        assert session.converted_user_id == test_user.id
        assert session.converted_at is not None


class TestCleanupExpired:
    async def test_cleanup_expired(self, db_session):
        old_time = datetime.now(timezone.utc) - timedelta(hours=25)
        expired_token = str(uuid.uuid4())
        fresh_token = str(uuid.uuid4())

        expired = GuestSession(
            session_token=expired_token,
            ip_address="1.2.3.4",
            is_deleted=False,
            last_activity_at=old_time,
        )
        fresh = GuestSession(
            session_token=fresh_token,
            ip_address="5.6.7.8",
            is_deleted=False,
            last_activity_at=datetime.now(timezone.utc),
        )
        db_session.add(expired)
        db_session.add(fresh)
        await db_session.commit()

        count = await GuestSessionService.cleanup_expired(db_session, ttl_hours=24)
        await db_session.commit()

        assert count == 1

        result = await db_session.execute(
            select(GuestSession).where(GuestSession.session_token == expired_token)
        )
        expired_session = result.scalar_one_or_none()
        assert expired_session is not None
        assert expired_session.is_deleted is True

        result2 = await db_session.execute(
            select(GuestSession).where(GuestSession.session_token == fresh_token)
        )
        fresh_session = result2.scalar_one_or_none()
        assert fresh_session.is_deleted is False

    async def test_cleanup_preserves_converted(self, db_session, test_user):
        old_time = datetime.now(timezone.utc) - timedelta(hours=25)
        token = str(uuid.uuid4())

        converted = GuestSession(
            session_token=token,
            ip_address="1.2.3.4",
            is_deleted=False,
            last_activity_at=old_time,
            converted_user_id=test_user.id,
            converted_at=datetime.now(timezone.utc),
        )
        db_session.add(converted)
        await db_session.commit()

        count = await GuestSessionService.cleanup_expired(db_session, ttl_hours=24)
        await db_session.commit()

        assert count == 0

        result = await db_session.execute(
            select(GuestSession).where(GuestSession.session_token == token)
        )
        sess = result.scalar_one_or_none()
        assert sess.is_deleted is False

    async def test_cleanup_preserves_active(self, db_session):
        fresh_token = str(uuid.uuid4())
        fresh = GuestSession(
            session_token=fresh_token,
            ip_address="1.2.3.4",
            is_deleted=False,
            last_activity_at=datetime.now(timezone.utc) - timedelta(hours=1),
        )
        db_session.add(fresh)
        await db_session.commit()

        count = await GuestSessionService.cleanup_expired(db_session, ttl_hours=24)
        await db_session.commit()

        assert count == 0
