import uuid
import pytest
from httpx import AsyncClient
from datetime import datetime, timezone

from app.models.quiz import (
    QuizSession,
    QuizSessionStatus,
    QuizMode,
    SourceMode,
    QuizItem,
    QuestionType,
    AnswerLog,
    Judgement,
    ErrorType,
)
from app.models.objection import Objection, ObjectionStatus
from app.middleware.auth import hash_password, create_access_token
from .conftest import make_quiz_items


class TestCreateObjection:
    async def test_create_objection_success(
        self, auth_client: AsyncClient, db_session, test_user, ready_file
    ):
        # Create a graded session with an incorrect answer_log
        session = QuizSession(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            mode=QuizMode.normal,
            source_mode=SourceMode.document_based,
            status=QuizSessionStatus.graded,
            question_count=1,
            total_score=0.0,
            max_score=1.0,
        )
        db_session.add(session)
        await db_session.flush()

        item = QuizItem(
            id=str(uuid.uuid4()),
            quiz_session_id=session.id,
            item_order=1,
            question_type=QuestionType.multiple_choice,
            question_text="Test question?",
            options_json={"choices": [{"label": "A", "text": "Option A"}]},
            correct_answer_json={"answer": "A"},
            explanation_text="Explanation",
            concept_key="test_concept",
            concept_label="Test Concept",
        )
        db_session.add(item)
        await db_session.flush()

        answer_log = AnswerLog(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            quiz_session_id=session.id,
            quiz_item_id=item.id,
            user_answer_raw="B",
            user_answer_normalized="b",
            judgement=Judgement.incorrect,
            score_awarded=0.0,
            max_score=1.0,
            is_active_result=True,
            graded_at=datetime.now(timezone.utc),
            error_type=ErrorType.concept_confusion,
        )
        db_session.add(answer_log)
        await db_session.commit()

        # Submit objection
        resp = await auth_client.post(
            f"/objections/quiz-sessions/{session.id}/items/{item.id}/objections",
            json={
                "answer_log_id": answer_log.id,
                "objection_reason": "I believe my answer should be accepted.",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "objection_id" in data
        assert data["status"] == "under_review"

        # Verify session status changed to objection_pending
        await db_session.refresh(session)
        assert session.status == QuizSessionStatus.objection_pending

    async def test_create_objection_nonexistent_session(self, auth_client: AsyncClient):
        fake_session_id = str(uuid.uuid4())
        fake_item_id = str(uuid.uuid4())
        fake_answer_log_id = str(uuid.uuid4())

        resp = await auth_client.post(
            f"/objections/quiz-sessions/{fake_session_id}/items/{fake_item_id}/objections",
            json={
                "answer_log_id": fake_answer_log_id,
                "objection_reason": "Test reason",
            },
        )
        assert resp.status_code == 404

    async def test_create_objection_other_user_session(
        self, client: AsyncClient, db_session, test_user, ready_file
    ):
        # Create another user
        other_user_id = str(uuid.uuid4())
        other = type(test_user)(
            id=other_user_id,
            username="otheruser",
            email="other@example.com",
            password_hash=hash_password("Pass123!"),
            role=test_user.role,
            is_active=True,
        )
        db_session.add(other)

        # Create session owned by other user
        session = QuizSession(
            id=str(uuid.uuid4()),
            user_id=other_user_id,
            mode=QuizMode.normal,
            source_mode=SourceMode.document_based,
            status=QuizSessionStatus.graded,
            question_count=1,
        )
        db_session.add(session)
        await db_session.flush()

        item = QuizItem(
            id=str(uuid.uuid4()),
            quiz_session_id=session.id,
            item_order=1,
            question_type=QuestionType.multiple_choice,
            question_text="Test?",
            correct_answer_json={"answer": "A"},
            concept_key="test",
            concept_label="Test",
        )
        db_session.add(item)
        await db_session.flush()

        answer_log = AnswerLog(
            id=str(uuid.uuid4()),
            user_id=other_user_id,
            quiz_session_id=session.id,
            quiz_item_id=item.id,
            user_answer_raw="B",
            judgement=Judgement.incorrect,
            score_awarded=0.0,
            max_score=1.0,
            is_active_result=True,
            graded_at=datetime.now(timezone.utc),
        )
        db_session.add(answer_log)
        await db_session.commit()

        # Test user tries to object to other user's session
        token = create_access_token(test_user.id, test_user.role.value)
        resp = await client.post(
            f"/objections/quiz-sessions/{session.id}/items/{item.id}/objections",
            json={
                "answer_log_id": answer_log.id,
                "objection_reason": "Test",
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 404

    async def test_create_objection_nonexistent_answer_log(
        self, auth_client: AsyncClient, db_session, test_user
    ):
        session = QuizSession(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            mode=QuizMode.normal,
            source_mode=SourceMode.document_based,
            status=QuizSessionStatus.graded,
            question_count=1,
        )
        db_session.add(session)
        await db_session.flush()

        item = QuizItem(
            id=str(uuid.uuid4()),
            quiz_session_id=session.id,
            item_order=1,
            question_type=QuestionType.multiple_choice,
            question_text="Test?",
            correct_answer_json={"answer": "A"},
            concept_key="test",
            concept_label="Test",
        )
        db_session.add(item)
        await db_session.commit()

        fake_answer_log_id = str(uuid.uuid4())
        resp = await auth_client.post(
            f"/objections/quiz-sessions/{session.id}/items/{item.id}/objections",
            json={
                "answer_log_id": fake_answer_log_id,
                "objection_reason": "Test",
            },
        )
        assert resp.status_code == 404

    async def test_create_objection_duplicate_prevention(
        self, auth_client: AsyncClient, db_session, test_user
    ):
        # Create graded session with answer_log
        session = QuizSession(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            mode=QuizMode.normal,
            source_mode=SourceMode.document_based,
            status=QuizSessionStatus.graded,
            question_count=1,
        )
        db_session.add(session)
        await db_session.flush()

        item = QuizItem(
            id=str(uuid.uuid4()),
            quiz_session_id=session.id,
            item_order=1,
            question_type=QuestionType.multiple_choice,
            question_text="Test?",
            correct_answer_json={"answer": "A"},
            concept_key="test",
            concept_label="Test",
        )
        db_session.add(item)
        await db_session.flush()

        answer_log = AnswerLog(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            quiz_session_id=session.id,
            quiz_item_id=item.id,
            user_answer_raw="B",
            judgement=Judgement.incorrect,
            score_awarded=0.0,
            max_score=1.0,
            is_active_result=True,
            graded_at=datetime.now(timezone.utc),
        )
        db_session.add(answer_log)
        await db_session.commit()

        # First objection
        resp1 = await auth_client.post(
            f"/objections/quiz-sessions/{session.id}/items/{item.id}/objections",
            json={
                "answer_log_id": answer_log.id,
                "objection_reason": "First objection",
            },
        )
        assert resp1.status_code == 200

        # Second objection for same answer_log
        resp2 = await auth_client.post(
            f"/objections/quiz-sessions/{session.id}/items/{item.id}/objections",
            json={
                "answer_log_id": answer_log.id,
                "objection_reason": "Second objection",
            },
        )
        assert resp2.status_code == 400

    async def test_create_objection_requires_auth(self, client: AsyncClient):
        fake_session_id = str(uuid.uuid4())
        fake_item_id = str(uuid.uuid4())
        fake_answer_log_id = str(uuid.uuid4())

        resp = await client.post(
            f"/objections/quiz-sessions/{fake_session_id}/items/{fake_item_id}/objections",
            json={
                "answer_log_id": fake_answer_log_id,
                "objection_reason": "Test",
            },
        )
        assert resp.status_code == 401

    async def test_create_objection_inactive_answer_log(
        self, auth_client: AsyncClient, db_session, test_user
    ):
        # Create graded session with inactive answer_log
        session = QuizSession(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            mode=QuizMode.normal,
            source_mode=SourceMode.document_based,
            status=QuizSessionStatus.graded,
            question_count=1,
        )
        db_session.add(session)
        await db_session.flush()

        item = QuizItem(
            id=str(uuid.uuid4()),
            quiz_session_id=session.id,
            item_order=1,
            question_type=QuestionType.multiple_choice,
            question_text="Test?",
            correct_answer_json={"answer": "A"},
            concept_key="test",
            concept_label="Test",
        )
        db_session.add(item)
        await db_session.flush()

        answer_log = AnswerLog(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            quiz_session_id=session.id,
            quiz_item_id=item.id,
            user_answer_raw="B",
            judgement=Judgement.incorrect,
            score_awarded=0.0,
            max_score=1.0,
            is_active_result=False,  # Inactive!
            graded_at=datetime.now(timezone.utc),
        )
        db_session.add(answer_log)
        await db_session.commit()

        resp = await auth_client.post(
            f"/objections/quiz-sessions/{session.id}/items/{item.id}/objections",
            json={
                "answer_log_id": answer_log.id,
                "objection_reason": "Test",
            },
        )
        assert resp.status_code == 404


class TestGetObjection:
    async def test_get_objection_success(
        self, auth_client: AsyncClient, db_session, test_user
    ):
        # Create objection
        session = QuizSession(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            mode=QuizMode.normal,
            source_mode=SourceMode.document_based,
            status=QuizSessionStatus.graded,
            question_count=1,
        )
        db_session.add(session)
        await db_session.flush()

        item = QuizItem(
            id=str(uuid.uuid4()),
            quiz_session_id=session.id,
            item_order=1,
            question_type=QuestionType.multiple_choice,
            question_text="Test?",
            correct_answer_json={"answer": "A"},
            concept_key="test",
            concept_label="Test",
        )
        db_session.add(item)
        await db_session.flush()

        answer_log = AnswerLog(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            quiz_session_id=session.id,
            quiz_item_id=item.id,
            user_answer_raw="B",
            judgement=Judgement.incorrect,
            score_awarded=0.0,
            max_score=1.0,
            is_active_result=True,
            graded_at=datetime.now(timezone.utc),
        )
        db_session.add(answer_log)
        await db_session.flush()

        objection = Objection(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            quiz_session_id=session.id,
            quiz_item_id=item.id,
            answer_log_id=answer_log.id,
            objection_reason="Test reason",
            status=ObjectionStatus.under_review,
        )
        db_session.add(objection)
        await db_session.commit()

        # Get objection
        resp = await auth_client.get(f"/objections/{objection.id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == objection.id
        assert data["quiz_session_id"] == session.id
        assert data["quiz_item_id"] == item.id
        assert data["answer_log_id"] == answer_log.id
        assert data["objection_reason"] == "Test reason"
        assert data["status"] == "under_review"
        assert "created_at" in data

    async def test_get_objection_not_found(self, auth_client: AsyncClient):
        fake_objection_id = str(uuid.uuid4())
        resp = await auth_client.get(f"/objections/{fake_objection_id}")
        assert resp.status_code == 404

    async def test_get_objection_other_user_denied(
        self, client: AsyncClient, db_session, test_user
    ):
        # Create another user
        other_user_id = str(uuid.uuid4())
        other = type(test_user)(
            id=other_user_id,
            username="otheruser",
            email="other@example.com",
            password_hash=hash_password("Pass123!"),
            role=test_user.role,
            is_active=True,
        )
        db_session.add(other)

        # Create objection owned by other user
        session = QuizSession(
            id=str(uuid.uuid4()),
            user_id=other_user_id,
            mode=QuizMode.normal,
            source_mode=SourceMode.document_based,
            status=QuizSessionStatus.graded,
            question_count=1,
        )
        db_session.add(session)
        await db_session.flush()

        item = QuizItem(
            id=str(uuid.uuid4()),
            quiz_session_id=session.id,
            item_order=1,
            question_type=QuestionType.multiple_choice,
            question_text="Test?",
            correct_answer_json={"answer": "A"},
            concept_key="test",
            concept_label="Test",
        )
        db_session.add(item)
        await db_session.flush()

        answer_log = AnswerLog(
            id=str(uuid.uuid4()),
            user_id=other_user_id,
            quiz_session_id=session.id,
            quiz_item_id=item.id,
            user_answer_raw="B",
            judgement=Judgement.incorrect,
            score_awarded=0.0,
            max_score=1.0,
            is_active_result=True,
            graded_at=datetime.now(timezone.utc),
        )
        db_session.add(answer_log)
        await db_session.flush()

        objection = Objection(
            id=str(uuid.uuid4()),
            user_id=other_user_id,
            quiz_session_id=session.id,
            quiz_item_id=item.id,
            answer_log_id=answer_log.id,
            objection_reason="Test reason",
            status=ObjectionStatus.under_review,
        )
        db_session.add(objection)
        await db_session.commit()

        # Test user tries to get other user's objection
        token = create_access_token(test_user.id, test_user.role.value)
        resp = await client.get(
            f"/objections/{objection.id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403
