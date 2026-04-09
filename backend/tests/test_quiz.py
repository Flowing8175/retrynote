import uuid
from httpx import AsyncClient
from datetime import datetime, timezone

from app.models.quiz import (
    QuizSession,
    QuizSessionStatus,
    QuizMode,
    SourceMode,
    QuizItem,
    QuestionType,
)


class TestQuizSessionCreate:
    async def test_create_session_document_based(
        self, auth_client: AsyncClient, ready_file
    ):
        resp = await auth_client.post(
            "/quiz-sessions",
            json={
                "mode": "normal",
                "selected_file_ids": [ready_file.id],
                "question_count": 5,
                "source_mode": "document_based",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "quiz_session_id" in data
        assert data["status"] in ("draft", "generating")
        assert "job_id" in data

    async def test_create_session_no_source(self, auth_client: AsyncClient):
        resp = await auth_client.post(
            "/quiz-sessions",
            json={
                "mode": "normal",
                "question_count": 3,
                "source_mode": "no_source",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "quiz_session_id" in data

    async def test_create_exam_session(self, auth_client: AsyncClient, ready_file):
        resp = await auth_client.post(
            "/quiz-sessions",
            json={
                "mode": "exam",
                "selected_file_ids": [ready_file.id],
                "question_count": 5,
                "source_mode": "document_based",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "quiz_session_id" in data

    async def test_create_session_with_idempotency_key(
        self, auth_client: AsyncClient, ready_file
    ):
        key = str(uuid.uuid4())
        resp1 = await auth_client.post(
            "/quiz-sessions",
            json={
                "mode": "normal",
                "selected_file_ids": [ready_file.id],
                "question_count": 3,
                "source_mode": "document_based",
                "idempotency_key": key,
            },
        )
        assert resp1.status_code == 200
        session_id_1 = resp1.json()["quiz_session_id"]

        resp2 = await auth_client.post(
            "/quiz-sessions",
            json={
                "mode": "normal",
                "selected_file_ids": [ready_file.id],
                "question_count": 3,
                "source_mode": "document_based",
                "idempotency_key": key,
            },
        )
        assert resp2.status_code == 200
        assert resp2.json()["quiz_session_id"] == session_id_1

    async def test_create_session_invalid_file(self, auth_client: AsyncClient):
        resp = await auth_client.post(
            "/quiz-sessions",
            json={
                "mode": "normal",
                "selected_file_ids": [str(uuid.uuid4())],
                "question_count": 3,
                "source_mode": "document_based",
            },
        )
        assert resp.status_code in (400, 403)

    async def test_create_session_with_manual_text(self, auth_client: AsyncClient):
        resp = await auth_client.post(
            "/quiz-sessions",
            json={
                "mode": "normal",
                "question_count": 3,
                "source_mode": "document_based",
                "manual_text": "This is manual text for quiz generation.",
            },
        )
        assert resp.status_code == 200

    async def test_create_session_requires_auth(self, client: AsyncClient):
        resp = await client.post(
            "/quiz-sessions",
            json={
                "mode": "normal",
                "question_count": 3,
                "source_mode": "no_source",
            },
        )
        assert resp.status_code == 401


class TestQuizSessionGet:
    async def test_list_sessions_returns_recent_history(
        self, auth_client: AsyncClient, db_session, test_user
    ):
        older_session = QuizSession(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            mode=QuizMode.normal,
            source_mode=SourceMode.document_based,
            status=QuizSessionStatus.ready,
            question_count=3,
            created_at=datetime(2024, 1, 1, tzinfo=timezone.utc),
        )
        newer_session = QuizSession(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            mode=QuizMode.exam,
            source_mode=SourceMode.no_source,
            status=QuizSessionStatus.generating,
            question_count=7,
            created_at=datetime(2024, 1, 2, tzinfo=timezone.utc),
        )
        db_session.add_all([older_session, newer_session])
        await db_session.commit()

        resp = await auth_client.get("/quiz-sessions?limit=10")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 2
        assert data[0]["id"] == newer_session.id
        assert data[1]["id"] == older_session.id

    async def test_get_session_detail(
        self, auth_client: AsyncClient, quiz_session_ready
    ):
        session, items = quiz_session_ready
        resp = await auth_client.get(f"/quiz-sessions/{session.id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == session.id
        assert data["mode"] == "normal"
        assert data["source_mode"] == "document_based"
        assert data["status"] == "ready"
        assert data["items_count"] == 3

    async def test_get_session_not_found(self, auth_client: AsyncClient):
        resp = await auth_client.get(f"/quiz-sessions/{uuid.uuid4()}")
        assert resp.status_code == 404

    async def test_get_session_other_user_denied(
        self, client: AsyncClient, db_session, quiz_session_ready
    ):
        from app.models import User, UserRole
        from app.middleware.auth import hash_password, create_access_token

        session, _ = quiz_session_ready
        other = User(
            id=str(uuid.uuid4()),
            username="stranger",
            email="stranger@example.com",
            password_hash=hash_password("Pass123!"),
            role=UserRole.user,
            is_active=True,
        )
        db_session.add(other)
        await db_session.commit()

        token = create_access_token(other.id, other.role.value)
        resp = await client.get(
            f"/quiz-sessions/{session.id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403


class TestQuizItems:
    async def test_get_items(self, auth_client: AsyncClient, quiz_session_ready):
        session, _ = quiz_session_ready
        resp = await auth_client.get(f"/quiz-sessions/{session.id}/items")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 3
        assert data[0]["question_type"] == "multiple_choice"
        assert "question_text" in data[0]
        assert "options" in data[0]

    async def test_get_items_exam_mode_hides_answers(
        self, auth_client: AsyncClient, exam_session_ready
    ):
        session, _ = exam_session_ready
        resp = await auth_client.get(f"/quiz-sessions/{session.id}/items")
        assert resp.status_code == 200
        data = resp.json()
        for item in data:
            assert "correct_answer" not in item
            assert "explanation" not in item


class TestNormalModeAnswer:
    async def test_submit_answer_correct(
        self, auth_client: AsyncClient, quiz_session_ready
    ):
        session, items = quiz_session_ready
        resp = await auth_client.post(
            f"/quiz-sessions/{session.id}/items/{items[0].id}/answer",
            json={"user_answer": "A"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["judgement"] == "correct"
        assert data["score_awarded"] == 1.0
        assert data["max_score"] == 1.0
        assert "answer_log_id" in data

    async def test_submit_answer_incorrect(
        self, auth_client: AsyncClient, quiz_session_ready
    ):
        session, items = quiz_session_ready
        resp = await auth_client.post(
            f"/quiz-sessions/{session.id}/items/{items[0].id}/answer",
            json={"user_answer": "B"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["judgement"] == "incorrect"
        assert data["score_awarded"] == 0.0

    async def test_submit_sets_session_in_progress(
        self, auth_client: AsyncClient, db_session, quiz_session_ready
    ):
        session, items = quiz_session_ready
        await auth_client.post(
            f"/quiz-sessions/{session.id}/items/{items[0].id}/answer",
            json={"user_answer": "A"},
        )
        await db_session.refresh(session)
        assert session.status == QuizSessionStatus.in_progress

    async def test_submit_all_items_graded(
        self, auth_client: AsyncClient, db_session, quiz_session_ready
    ):
        session, items = quiz_session_ready
        for item in items:
            await auth_client.post(
                f"/quiz-sessions/{session.id}/items/{item.id}/answer",
                json={"user_answer": "A"},
            )
        await db_session.refresh(session)
        assert session.status == QuizSessionStatus.in_progress

        complete_resp = await auth_client.post(f"/quiz-sessions/{session.id}/complete")
        assert complete_resp.status_code == 200
        data = complete_resp.json()
        assert data["status"] == "graded"
        assert data["total_score"] is not None
        assert data["max_score"] is not None

    async def test_submit_answer_normal_only(
        self, auth_client: AsyncClient, exam_session_ready
    ):
        session, items = exam_session_ready
        resp = await auth_client.post(
            f"/quiz-sessions/{session.id}/items/{items[0].id}/answer",
            json={"user_answer": "A"},
        )
        assert resp.status_code == 400

    async def test_submit_answer_next_item_hint(
        self, auth_client: AsyncClient, quiz_session_ready
    ):
        session, items = quiz_session_ready
        resp = await auth_client.post(
            f"/quiz-sessions/{session.id}/items/{items[0].id}/answer",
            json={"user_answer": "A"},
        )
        data = resp.json()
        assert data["next_item_id"] == items[1].id


class TestExamModeDraft:
    async def test_save_draft_answer(
        self, auth_client: AsyncClient, exam_session_ready
    ):
        session, items = exam_session_ready
        resp = await auth_client.post(
            f"/quiz-sessions/{session.id}/draft-answer",
            json={"item_id": items[0].id, "user_answer": "A"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "saved_at" in data

    async def test_save_draft_updates_existing(
        self, auth_client: AsyncClient, exam_session_ready
    ):
        session, items = exam_session_ready
        resp1 = await auth_client.post(
            f"/quiz-sessions/{session.id}/draft-answer",
            json={"item_id": items[0].id, "user_answer": "A"},
        )
        assert resp1.status_code == 200

        resp2 = await auth_client.post(
            f"/quiz-sessions/{session.id}/draft-answer",
            json={"item_id": items[0].id, "user_answer": "B"},
        )
        assert resp2.status_code == 200

    async def test_draft_only_for_exam(
        self, auth_client: AsyncClient, quiz_session_ready
    ):
        session, items = quiz_session_ready
        resp = await auth_client.post(
            f"/quiz-sessions/{session.id}/draft-answer",
            json={"item_id": items[0].id, "user_answer": "A"},
        )
        assert resp.status_code == 400

    async def test_draft_sets_session_in_progress(
        self, auth_client: AsyncClient, db_session, exam_session_ready
    ):
        session, items = exam_session_ready
        await auth_client.post(
            f"/quiz-sessions/{session.id}/draft-answer",
            json={"item_id": items[0].id, "user_answer": "A"},
        )
        await db_session.refresh(session)
        assert session.status == QuizSessionStatus.in_progress


class TestExamModeSubmit:
    async def test_submit_exam(
        self, auth_client: AsyncClient, db_session, exam_session_ready
    ):
        session, items = exam_session_ready
        for item in items:
            await auth_client.post(
                f"/quiz-sessions/{session.id}/draft-answer",
                json={"item_id": item.id, "user_answer": "A"},
            )

        resp = await auth_client.post(
            f"/quiz-sessions/{session.id}/submit",
            json={"idempotency_key": str(uuid.uuid4())},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] in ("submitted", "grading")
        assert "job_id" in data

    async def test_submit_exam_idempotency(
        self, auth_client: AsyncClient, db_session, exam_session_ready
    ):
        session, items = exam_session_ready
        for item in items:
            await auth_client.post(
                f"/quiz-sessions/{session.id}/draft-answer",
                json={"item_id": item.id, "user_answer": "A"},
            )

        key = str(uuid.uuid4())
        resp1 = await auth_client.post(
            f"/quiz-sessions/{session.id}/submit",
            json={"idempotency_key": key},
        )
        assert resp1.status_code == 200
        status1 = resp1.json()["status"]

        resp2 = await auth_client.post(
            f"/quiz-sessions/{session.id}/submit",
            json={"idempotency_key": key},
        )
        assert resp2.status_code == 200
        assert resp2.json()["status"] == status1

    async def test_submit_exam_only_for_exam(
        self, auth_client: AsyncClient, quiz_session_ready
    ):
        session, items = quiz_session_ready
        resp = await auth_client.post(
            f"/quiz-sessions/{session.id}/submit",
            json={"idempotency_key": str(uuid.uuid4())},
        )
        assert resp.status_code == 400


class TestQuestionTypes:
    async def test_ox_question(self, auth_client: AsyncClient, db_session, test_user):
        session = QuizSession(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            mode=QuizMode.normal,
            source_mode=SourceMode.document_based,
            status=QuizSessionStatus.ready,
            question_count=1,
        )
        db_session.add(session)
        await db_session.flush()

        item = QuizItem(
            id=str(uuid.uuid4()),
            quiz_session_id=session.id,
            item_order=1,
            question_type=QuestionType.ox,
            question_text="태양은 항성이다.",
            correct_answer_json={"answer": "O"},
            explanation_text="태양은 우리 태양계의 항성입니다.",
            concept_key="astronomy_sun",
            concept_label="천문학 - 태양",
        )
        db_session.add(item)
        await db_session.commit()

        resp = await auth_client.post(
            f"/quiz-sessions/{session.id}/items/{item.id}/answer",
            json={"user_answer": "O"},
        )
        assert resp.status_code == 200
        assert resp.json()["judgement"] == "correct"

    async def test_short_answer_exact_match(
        self, auth_client: AsyncClient, db_session, test_user
    ):
        session = QuizSession(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            mode=QuizMode.normal,
            source_mode=SourceMode.document_based,
            status=QuizSessionStatus.ready,
            question_count=1,
        )
        db_session.add(session)
        await db_session.flush()

        item = QuizItem(
            id=str(uuid.uuid4()),
            quiz_session_id=session.id,
            item_order=1,
            question_type=QuestionType.short_answer,
            question_text="한국의 수도는?",
            correct_answer_json={
                "answer": "서울",
                "accepted_answers": ["서울", "서울특별시"],
            },
            explanation_text="한국의 수도는 서울입니다.",
            concept_key="geography_korea",
            concept_label="지리 - 한국수도",
        )
        db_session.add(item)
        await db_session.commit()

        resp = await auth_client.post(
            f"/quiz-sessions/{session.id}/items/{item.id}/answer",
            json={"user_answer": "서울"},
        )
        assert resp.status_code == 200
        assert resp.json()["judgement"] == "correct"

    async def test_essay_question_uses_ai(
        self,
        auth_client: AsyncClient,
        db_session,
        test_user,
        mock_ai_grading_correct,
    ):
        session = QuizSession(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            mode=QuizMode.normal,
            source_mode=SourceMode.document_based,
            status=QuizSessionStatus.ready,
            question_count=1,
        )
        db_session.add(session)
        await db_session.flush()

        item = QuizItem(
            id=str(uuid.uuid4()),
            quiz_session_id=session.id,
            item_order=1,
            question_type=QuestionType.essay,
            question_text="사회복지실천의 가치를 서술하시오.",
            correct_answer_json={"answer": "인간 존중, 자기결정, 사회정의 등"},
            explanation_text="사회복지실천의 핵심 가치입니다.",
            concept_key="social_work_values",
            concept_label="사회복지 - 가치",
            source_refs_json={},
        )
        db_session.add(item)
        await db_session.commit()

        resp = await auth_client.post(
            f"/quiz-sessions/{session.id}/items/{item.id}/answer",
            json={"user_answer": "인간의 존엄성과 자기결정권을 존중하는 것입니다."},
        )
        assert resp.status_code == 200
        mock_ai_grading_correct.assert_called_once()


class TestScoreCalculation:
    async def test_correct_score(self, auth_client: AsyncClient, quiz_session_ready):
        session, items = quiz_session_ready
        resp = await auth_client.post(
            f"/quiz-sessions/{session.id}/items/{items[0].id}/answer",
            json={"user_answer": "A"},
        )
        assert resp.json()["score_awarded"] == 1.0

    async def test_incorrect_score(self, auth_client: AsyncClient, quiz_session_ready):
        session, items = quiz_session_ready
        resp = await auth_client.post(
            f"/quiz-sessions/{session.id}/items/{items[0].id}/answer",
            json={"user_answer": "B"},
        )
        assert resp.json()["score_awarded"] == 0.0

    async def test_total_score_calculation(
        self, auth_client: AsyncClient, db_session, quiz_session_ready
    ):
        session, items = quiz_session_ready
        answers = ["A", "B", "A"]
        for item, answer in zip(items, answers):
            await auth_client.post(
                f"/quiz-sessions/{session.id}/items/{item.id}/answer",
                json={"user_answer": answer},
            )

        complete_resp = await auth_client.post(f"/quiz-sessions/{session.id}/complete")
        assert complete_resp.status_code == 200
        data = complete_resp.json()
        assert data["total_score"] == 2.0
        assert data["max_score"] == 3.0
