"""Tests for POST /auth/convert-guest endpoint."""
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

from app.models.guest import GuestSession
from app.models.quiz import QuizMode, QuizSession, QuizSessionStatus, SourceMode


GUEST_TOKEN = "11111111-2222-4333-8444-555555555555"


@pytest.fixture(autouse=True)
def _mock_turnstile_for_conversion():
    with patch("app.api.auth.verify_turnstile_token", new_callable=AsyncMock, return_value=True):
        yield


@pytest.fixture(autouse=True)
def _reset_rate_limiter():
    from app.rate_limit import limiter
    limiter._storage.reset()
    yield


async def _make_guest_session(db_session, token=GUEST_TOKEN) -> GuestSession:
    gs = GuestSession(
        session_token=token,
        ip_address="127.0.0.1",
        is_deleted=False,
        last_activity_at=datetime.now(timezone.utc),
    )
    db_session.add(gs)
    await db_session.commit()
    await db_session.refresh(gs)
    return gs


async def _make_quiz_session(db_session, guest: GuestSession) -> QuizSession:
    qs = QuizSession(
        id=str(uuid.uuid4()),
        user_id=None,
        guest_session_id=guest.id,
        mode=QuizMode.normal,
        source_mode=SourceMode.no_source,
        status=QuizSessionStatus.ready,
        question_count=3,
        generation_model_name="gpt-4o-mini",
    )
    db_session.add(qs)
    await db_session.commit()
    return qs


class TestConvertGuest:
    async def test_convert_guest_success(self, client: AsyncClient, db_session):
        gs = await _make_guest_session(db_session)
        qs = await _make_quiz_session(db_session, gs)

        resp = await client.post(
            "/auth/convert-guest",
            json={
                "username": "newconvert",
                "email": "newconvert@example.com",
                "password": "StrongPass123!",
                "guest_session_id": GUEST_TOKEN,
                "turnstile_token": "test-token",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert "refresh_token" in data

        # Verify quiz session was migrated
        await db_session.refresh(qs)
        assert qs.user_id is not None

    async def test_convert_guest_duplicate_email(self, client: AsyncClient, db_session, test_user):
        gs = await _make_guest_session(db_session)

        resp = await client.post(
            "/auth/convert-guest",
            json={
                "username": "brandnew",
                "email": "testuser@example.com",  # already taken
                "password": "StrongPass123!",
                "guest_session_id": GUEST_TOKEN,
                "turnstile_token": "test-token",
            },
        )
        assert resp.status_code == 409

        # Guest session should not be marked converted
        await db_session.refresh(gs)
        assert gs.converted_user_id is None

    async def test_convert_guest_duplicate_username(self, client: AsyncClient, db_session, test_user):
        gs = await _make_guest_session(db_session)

        resp = await client.post(
            "/auth/convert-guest",
            json={
                "username": "testuser",  # already taken
                "email": "fresh@example.com",
                "password": "StrongPass123!",
                "guest_session_id": GUEST_TOKEN,
                "turnstile_token": "test-token",
            },
        )
        assert resp.status_code == 409

        await db_session.refresh(gs)
        assert gs.converted_user_id is None

    async def test_convert_guest_empty_session(self, client: AsyncClient, db_session):
        """Guest session with no quizzes — account created, empty dashboard."""
        await _make_guest_session(db_session)

        resp = await client.post(
            "/auth/convert-guest",
            json={
                "username": "emptyguest",
                "email": "emptyguest@example.com",
                "password": "StrongPass123!",
                "guest_session_id": GUEST_TOKEN,
                "turnstile_token": "test-token",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data

    async def test_convert_guest_invalid_session(self, client: AsyncClient, db_session):
        """Non-existent guest session token → 404."""
        resp = await client.post(
            "/auth/convert-guest",
            json={
                "username": "ghostuser",
                "email": "ghost@example.com",
                "password": "StrongPass123!",
                "guest_session_id": "99999999-aaaa-4bbb-8ccc-dddddddddddd",
                "turnstile_token": "test-token",
            },
        )
        assert resp.status_code == 404

    async def test_convert_guest_already_converted(self, client: AsyncClient, db_session, test_user):
        """Already-converted guest session → 409."""
        gs = GuestSession(
            session_token=GUEST_TOKEN,
            ip_address="127.0.0.1",
            is_deleted=False,
            last_activity_at=datetime.now(timezone.utc),
            converted_user_id=test_user.id,
            converted_at=datetime.now(timezone.utc),
        )
        db_session.add(gs)
        await db_session.commit()

        resp = await client.post(
            "/auth/convert-guest",
            json={
                "username": "anotheruser",
                "email": "another@example.com",
                "password": "StrongPass123!",
                "guest_session_id": GUEST_TOKEN,
                "turnstile_token": "test-token",
            },
        )
        assert resp.status_code == 409
