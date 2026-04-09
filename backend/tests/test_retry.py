import uuid
from httpx import AsyncClient

from app.models.quiz import (
    QuizSession,
    QuizSessionStatus,
    QuizMode,
)
from app.models.objection import WeakPoint


class TestCreateRetrySet:
    async def test_retry_from_wrong_notes(
        self, auth_client: AsyncClient, db_session, test_user
    ):
        # Create WeakPoint entries for the user
        weak1 = WeakPoint(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            concept_key="concept_1",
            concept_label="Concept 1",
            category_tag="category_a",
            wrong_count=3,
            partial_count=0,
            skip_count=0,
            streak_wrong_count=2,
            recommended_action="review",
        )
        weak2 = WeakPoint(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            concept_key="concept_2",
            concept_label="Concept 2",
            category_tag="category_a",
            wrong_count=2,
            partial_count=1,
            skip_count=0,
            streak_wrong_count=1,
            recommended_action="retry",
        )
        db_session.add(weak1)
        db_session.add(weak2)
        await db_session.commit()

        resp = await auth_client.post(
            "/retry-sets",
            json={
                "source": "wrong_notes",
                "size": 5,
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "quiz_session_id" in data
        assert "job_id" in data

    async def test_retry_from_dashboard_recommendation(
        self, auth_client: AsyncClient, db_session, test_user
    ):
        # Create WeakPoint entries
        weak = WeakPoint(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            concept_key="concept_dashboard",
            concept_label="Dashboard Concept",
            category_tag="category_b",
            wrong_count=5,
            partial_count=2,
            skip_count=1,
            streak_wrong_count=3,
            recommended_action="focus",
        )
        db_session.add(weak)
        await db_session.commit()

        resp = await auth_client.post(
            "/retry-sets",
            json={
                "source": "dashboard_recommendation",
                "size": 10,
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "quiz_session_id" in data
        assert "job_id" in data

    async def test_retry_with_explicit_concept_keys(
        self, auth_client: AsyncClient, db_session, test_user
    ):
        resp = await auth_client.post(
            "/retry-sets",
            json={
                "source": "wrong_notes",
                "concept_keys": ["my_concept"],
                "size": 5,
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "quiz_session_id" in data
        assert "job_id" in data

        # Verify session was created with generation_priority=retry
        session = await db_session.get(QuizSession, data["quiz_session_id"])
        assert session is not None
        assert session.generation_priority == "retry"

    async def test_retry_no_weak_concepts(
        self, auth_client: AsyncClient, db_session, test_user
    ):
        # No WeakPoints created - should return 400
        resp = await auth_client.post(
            "/retry-sets",
            json={
                "source": "wrong_notes",
                "size": 5,
            },
        )
        assert resp.status_code == 400
        assert "No weak concepts" in resp.json()["detail"]

    async def test_retry_no_concepts_with_empty_keys(
        self, auth_client: AsyncClient, db_session, test_user
    ):
        # No WeakPoints and empty concept_keys - should return 400
        resp = await auth_client.post(
            "/retry-sets",
            json={
                "source": "wrong_notes",
                "concept_keys": [],
                "size": 5,
            },
        )
        assert resp.status_code == 400
        assert "No weak concepts" in resp.json()["detail"]

    async def test_retry_session_mode(
        self, auth_client: AsyncClient, db_session, test_user
    ):
        # Create WeakPoint entries
        weak = WeakPoint(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            concept_key="concept_mode_test",
            concept_label="Mode Test Concept",
            category_tag="category_c",
            wrong_count=2,
            partial_count=0,
            skip_count=0,
            streak_wrong_count=1,
            recommended_action="review",
        )
        db_session.add(weak)
        await db_session.commit()

        resp = await auth_client.post(
            "/retry-sets",
            json={
                "source": "wrong_notes",
                "size": 5,
            },
        )
        assert resp.status_code == 200
        data = resp.json()

        # Verify session has mode=normal and status=generating
        session = await db_session.get(QuizSession, data["quiz_session_id"])
        assert session is not None
        assert session.mode == QuizMode.normal
        assert session.status == QuizSessionStatus.generating

    async def test_requires_auth(self, client: AsyncClient):
        resp = await client.post(
            "/retry-sets",
            json={
                "source": "wrong_notes",
                "size": 5,
            },
        )
        assert resp.status_code == 401
