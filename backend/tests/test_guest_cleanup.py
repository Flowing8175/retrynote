"""Tests for guest session cleanup logic."""
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.models.guest import GuestSession
from app.services.guest_session_service import GuestSessionService


class TestCleanupExpiredSessions:
    async def test_cleanup_expired_sessions(self, db_session):
        """Insert expired session, call cleanup_expired, verify soft-deleted."""
        old_time = datetime.now(timezone.utc) - timedelta(hours=25)
        token = str(uuid.uuid4())

        session = GuestSession(
            session_token=token,
            ip_address="1.2.3.4",
            is_deleted=False,
            last_activity_at=old_time,
        )
        db_session.add(session)
        await db_session.commit()

        count = await GuestSessionService.cleanup_expired(db_session, ttl_hours=24)
        await db_session.commit()

        assert count == 1

        result = await db_session.execute(
            select(GuestSession).where(GuestSession.session_token == token)
        )
        sess = result.scalar_one_or_none()
        assert sess is not None
        assert sess.is_deleted is True

    async def test_cleanup_preserves_active(self, db_session):
        """Session updated recently should NOT be deleted."""
        token = str(uuid.uuid4())
        session = GuestSession(
            session_token=token,
            ip_address="5.6.7.8",
            is_deleted=False,
            last_activity_at=datetime.now(timezone.utc) - timedelta(hours=1),
        )
        db_session.add(session)
        await db_session.commit()

        count = await GuestSessionService.cleanup_expired(db_session, ttl_hours=24)
        await db_session.commit()

        assert count == 0

        result = await db_session.execute(
            select(GuestSession).where(GuestSession.session_token == token)
        )
        sess = result.scalar_one_or_none()
        assert sess.is_deleted is False

    async def test_cleanup_preserves_converted(self, db_session, test_user):
        """Converted session should not be deleted even if old."""
        old_time = datetime.now(timezone.utc) - timedelta(hours=48)
        token = str(uuid.uuid4())

        session = GuestSession(
            session_token=token,
            ip_address="9.8.7.6",
            is_deleted=False,
            last_activity_at=old_time,
            converted_user_id=test_user.id,
            converted_at=datetime.now(timezone.utc) - timedelta(hours=47),
        )
        db_session.add(session)
        await db_session.commit()

        count = await GuestSessionService.cleanup_expired(db_session, ttl_hours=24)
        await db_session.commit()

        assert count == 0

        result = await db_session.execute(
            select(GuestSession).where(GuestSession.session_token == token)
        )
        sess = result.scalar_one_or_none()
        assert sess.is_deleted is False

    async def test_cleanup_mixed_sessions(self, db_session):
        """Two sessions: one expired, one fresh — only expired is deleted."""
        old_time = datetime.now(timezone.utc) - timedelta(hours=25)
        expired_token = str(uuid.uuid4())
        fresh_token = str(uuid.uuid4())

        expired = GuestSession(
            session_token=expired_token,
            ip_address="1.1.1.1",
            is_deleted=False,
            last_activity_at=old_time,
        )
        fresh = GuestSession(
            session_token=fresh_token,
            ip_address="2.2.2.2",
            is_deleted=False,
            last_activity_at=datetime.now(timezone.utc),
        )
        db_session.add(expired)
        db_session.add(fresh)
        await db_session.commit()

        count = await GuestSessionService.cleanup_expired(db_session, ttl_hours=24)
        await db_session.commit()

        assert count == 1

        r1 = await db_session.execute(
            select(GuestSession).where(GuestSession.session_token == expired_token)
        )
        assert r1.scalar_one().is_deleted is True

        r2 = await db_session.execute(
            select(GuestSession).where(GuestSession.session_token == fresh_token)
        )
        assert r2.scalar_one().is_deleted is False

    async def test_cleanup_already_deleted_not_counted(self, db_session):
        """Already soft-deleted session should not be counted again."""
        old_time = datetime.now(timezone.utc) - timedelta(hours=30)
        token = str(uuid.uuid4())

        session = GuestSession(
            session_token=token,
            ip_address="3.3.3.3",
            is_deleted=True,  # already deleted
            last_activity_at=old_time,
        )
        db_session.add(session)
        await db_session.commit()

        count = await GuestSessionService.cleanup_expired(db_session, ttl_hours=24)
        await db_session.commit()

        assert count == 0
