import uuid
import pytest
from datetime import datetime, timedelta, timezone
from httpx import AsyncClient

from app.models.quiz import (
    QuizSession,
    QuizSessionStatus,
    QuizMode,
    SourceMode,
    QuizSessionFile,
    QuizItem,
    QuestionType,
    AnswerLog,
    Judgement,
)
from app.models.objection import WeakPoint
from app.models.file import File, FileSourceType, FileStatus


class TestGetDashboard:
    async def test_empty_dashboard(
        self, auth_client: AsyncClient, db_session, test_user
    ):
        resp = await auth_client.get("/dashboard")
        assert resp.status_code == 200
        data = resp.json()
        assert data["overall_accuracy"] == 0
        assert data["score_rate"] == 0
        assert data["learning_volume"] == 0
        assert data["coaching_summary"] is None

    async def test_dashboard_7d_range(
        self, auth_client: AsyncClient, db_session, test_user
    ):
        # Create a quiz session with items and answer logs
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
            question_text="Test question",
            correct_answer_json={"answer": "A"},
            explanation_text="Explanation",
            concept_key="concept_test",
            concept_label="Test Concept",
            category_tag="test_category",
        )
        db_session.add(item)
        await db_session.flush()

        answer_log = AnswerLog(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            quiz_session_id=session.id,
            quiz_item_id=item.id,
            judgement=Judgement.correct,
            score_awarded=1.0,
            max_score=1.0,
            is_active_result=True,
            graded_at=datetime.now(timezone.utc),
        )
        db_session.add(answer_log)
        await db_session.commit()

        resp = await auth_client.get("/dashboard?range=7d")
        assert resp.status_code == 200
        data = resp.json()
        assert data["learning_volume"] >= 1

    async def test_dashboard_30d_range(
        self, auth_client: AsyncClient, db_session, test_user
    ):
        # Create test data
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
            question_text="Test question",
            correct_answer_json={"answer": "A"},
            explanation_text="Explanation",
            concept_key="concept_30d",
            concept_label="30d Concept",
        )
        db_session.add(item)
        await db_session.flush()

        answer_log = AnswerLog(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            quiz_session_id=session.id,
            quiz_item_id=item.id,
            judgement=Judgement.correct,
            score_awarded=1.0,
            max_score=1.0,
            is_active_result=True,
            graded_at=datetime.now(timezone.utc) - timedelta(days=15),
        )
        db_session.add(answer_log)
        await db_session.commit()

        resp = await auth_client.get("/dashboard?range=30d")
        assert resp.status_code == 200
        data = resp.json()
        assert "overall_accuracy" in data
        assert "score_rate" in data
        assert "learning_volume" in data

    async def test_dashboard_all_range(
        self, auth_client: AsyncClient, db_session, test_user
    ):
        resp = await auth_client.get("/dashboard?range=all")
        assert resp.status_code == 200
        data = resp.json()
        assert "overall_accuracy" in data
        assert "score_rate" in data
        assert "learning_volume" in data

    async def test_dashboard_with_file_filter(
        self, auth_client: AsyncClient, db_session, test_user
    ):
        # Create a file
        file = File(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            original_filename="test.pdf",
            file_type="pdf",
            file_size_bytes=1024,
            source_type=FileSourceType.upload,
            status=FileStatus.ready,
        )
        db_session.add(file)
        await db_session.flush()

        # Create session linked to file
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

        session_file = QuizSessionFile(
            id=str(uuid.uuid4()),
            quiz_session_id=session.id,
            file_id=file.id,
        )
        db_session.add(session_file)

        item = QuizItem(
            id=str(uuid.uuid4()),
            quiz_session_id=session.id,
            item_order=1,
            question_type=QuestionType.multiple_choice,
            question_text="Test question",
            correct_answer_json={"answer": "A"},
            explanation_text="Explanation",
            concept_key="concept_file",
            concept_label="File Concept",
        )
        db_session.add(item)
        await db_session.flush()

        answer_log = AnswerLog(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            quiz_session_id=session.id,
            quiz_item_id=item.id,
            judgement=Judgement.correct,
            score_awarded=1.0,
            max_score=1.0,
            is_active_result=True,
            graded_at=datetime.now(timezone.utc),
        )
        db_session.add(answer_log)
        await db_session.commit()

        resp = await auth_client.get(f"/dashboard?file_id={file.id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["learning_volume"] >= 1

    async def test_dashboard_with_category_filter(
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
            question_text="Test question",
            correct_answer_json={"answer": "A"},
            explanation_text="Explanation",
            concept_key="concept_cat",
            concept_label="Category Concept",
            category_tag="specific_category",
        )
        db_session.add(item)
        await db_session.flush()

        answer_log = AnswerLog(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            quiz_session_id=session.id,
            quiz_item_id=item.id,
            judgement=Judgement.correct,
            score_awarded=1.0,
            max_score=1.0,
            is_active_result=True,
            graded_at=datetime.now(timezone.utc),
        )
        db_session.add(answer_log)
        await db_session.commit()

        resp = await auth_client.get("/dashboard?category_tag=specific_category")
        assert resp.status_code == 200
        data = resp.json()
        assert data["learning_volume"] >= 1

    async def test_dashboard_weak_concepts(
        self, auth_client: AsyncClient, db_session, test_user
    ):
        # Create WeakPoint entries
        weak = WeakPoint(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            concept_key="weak_concept_1",
            concept_label="Weak Concept 1",
            category_tag="weak_category",
            wrong_count=5,
            partial_count=2,
            skip_count=1,
            streak_wrong_count=3,
            recommended_action="review",
        )
        db_session.add(weak)
        await db_session.commit()

        resp = await auth_client.get("/dashboard")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["weak_concepts"]) >= 1
        assert any(
            wc["concept_key"] == "weak_concept_1" for wc in data["weak_concepts"]
        )

    async def test_dashboard_accuracy_by_type(
        self, auth_client: AsyncClient, db_session, test_user
    ):
        # Create session with multiple question types
        session = QuizSession(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            mode=QuizMode.normal,
            source_mode=SourceMode.document_based,
            status=QuizSessionStatus.graded,
            question_count=2,
        )
        db_session.add(session)
        await db_session.flush()

        # Multiple choice item
        item1 = QuizItem(
            id=str(uuid.uuid4()),
            quiz_session_id=session.id,
            item_order=1,
            question_type=QuestionType.multiple_choice,
            question_text="MC Question",
            correct_answer_json={"answer": "A"},
            concept_key="mc_concept",
            concept_label="MC Concept",
        )
        db_session.add(item1)

        # OX item
        item2 = QuizItem(
            id=str(uuid.uuid4()),
            quiz_session_id=session.id,
            item_order=2,
            question_type=QuestionType.ox,
            question_text="OX Question",
            correct_answer_json={"answer": "O"},
            concept_key="ox_concept",
            concept_label="OX Concept",
        )
        db_session.add(item2)
        await db_session.flush()

        # Answer logs
        answer1 = AnswerLog(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            quiz_session_id=session.id,
            quiz_item_id=item1.id,
            judgement=Judgement.correct,
            score_awarded=1.0,
            max_score=1.0,
            is_active_result=True,
            graded_at=datetime.now(timezone.utc),
        )
        answer2 = AnswerLog(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            quiz_session_id=session.id,
            quiz_item_id=item2.id,
            judgement=Judgement.incorrect,
            score_awarded=0.0,
            max_score=1.0,
            is_active_result=True,
            graded_at=datetime.now(timezone.utc),
        )
        db_session.add(answer1)
        db_session.add(answer2)
        await db_session.commit()

        resp = await auth_client.get("/dashboard")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["accuracy_by_type"]) >= 1

    async def test_dashboard_coaching_summary_high(
        self, auth_client: AsyncClient, db_session, test_user
    ):
        # Create all-correct answers (>=80% accuracy)
        session = QuizSession(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            mode=QuizMode.normal,
            source_mode=SourceMode.document_based,
            status=QuizSessionStatus.graded,
            question_count=5,
        )
        db_session.add(session)
        await db_session.flush()

        for i in range(5):
            item = QuizItem(
                id=str(uuid.uuid4()),
                quiz_session_id=session.id,
                item_order=i + 1,
                question_type=QuestionType.multiple_choice,
                question_text=f"Question {i + 1}",
                correct_answer_json={"answer": "A"},
                concept_key=f"concept_high_{i}",
                concept_label=f"Concept {i}",
            )
            db_session.add(item)
            await db_session.flush()

            answer = AnswerLog(
                id=str(uuid.uuid4()),
                user_id=test_user.id,
                quiz_session_id=session.id,
                quiz_item_id=item.id,
                judgement=Judgement.correct,
                score_awarded=1.0,
                max_score=1.0,
                is_active_result=True,
                graded_at=datetime.now(timezone.utc),
            )
            db_session.add(answer)

        await db_session.commit()

        resp = await auth_client.get("/dashboard")
        assert resp.status_code == 200
        data = resp.json()
        assert data["coaching_summary"] is not None
        assert "우수" in data["coaching_summary"]

    async def test_dashboard_coaching_summary_medium(
        self, auth_client: AsyncClient, db_session, test_user
    ):
        # Create mixed answers (50-79% accuracy)
        session = QuizSession(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            mode=QuizMode.normal,
            source_mode=SourceMode.document_based,
            status=QuizSessionStatus.graded,
            question_count=4,
        )
        db_session.add(session)
        await db_session.flush()

        for i in range(4):
            item = QuizItem(
                id=str(uuid.uuid4()),
                quiz_session_id=session.id,
                item_order=i + 1,
                question_type=QuestionType.multiple_choice,
                question_text=f"Question {i + 1}",
                correct_answer_json={"answer": "A"},
                concept_key=f"concept_med_{i}",
                concept_label=f"Concept {i}",
            )
            db_session.add(item)
            await db_session.flush()

            # 2 correct, 2 incorrect = 50%
            judgement = Judgement.correct if i < 2 else Judgement.incorrect
            answer = AnswerLog(
                id=str(uuid.uuid4()),
                user_id=test_user.id,
                quiz_session_id=session.id,
                quiz_item_id=item.id,
                judgement=judgement,
                score_awarded=1.0 if i < 2 else 0.0,
                max_score=1.0,
                is_active_result=True,
                graded_at=datetime.now(timezone.utc),
            )
            db_session.add(answer)

        await db_session.commit()

        resp = await auth_client.get("/dashboard")
        assert resp.status_code == 200
        data = resp.json()
        assert data["coaching_summary"] is not None
        assert "취약" in data["coaching_summary"]

    async def test_dashboard_coaching_summary_low(
        self, auth_client: AsyncClient, db_session, test_user
    ):
        # Create all-incorrect answers (<50% accuracy)
        session = QuizSession(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            mode=QuizMode.normal,
            source_mode=SourceMode.document_based,
            status=QuizSessionStatus.graded,
            question_count=3,
        )
        db_session.add(session)
        await db_session.flush()

        for i in range(3):
            item = QuizItem(
                id=str(uuid.uuid4()),
                quiz_session_id=session.id,
                item_order=i + 1,
                question_type=QuestionType.multiple_choice,
                question_text=f"Question {i + 1}",
                correct_answer_json={"answer": "A"},
                concept_key=f"concept_low_{i}",
                concept_label=f"Concept {i}",
            )
            db_session.add(item)
            await db_session.flush()

            answer = AnswerLog(
                id=str(uuid.uuid4()),
                user_id=test_user.id,
                quiz_session_id=session.id,
                quiz_item_id=item.id,
                judgement=Judgement.incorrect,
                score_awarded=0.0,
                max_score=1.0,
                is_active_result=True,
                graded_at=datetime.now(timezone.utc),
            )
            db_session.add(answer)

        await db_session.commit()

        resp = await auth_client.get("/dashboard")
        assert resp.status_code == 200
        data = resp.json()
        assert data["coaching_summary"] is not None
        assert "개선" in data["coaching_summary"]

    async def test_dashboard_response_structure(
        self, auth_client: AsyncClient, db_session, test_user
    ):
        resp = await auth_client.get("/dashboard")
        assert resp.status_code == 200
        data = resp.json()

        # Verify all expected fields are present
        assert "overall_accuracy" in data
        assert "score_rate" in data
        assert "learning_volume" in data
        assert "weak_concepts" in data
        assert "accuracy_by_type" in data
        assert "accuracy_by_subject" in data
        assert "accuracy_by_file" in data
        assert "retry_recommendations" in data
        assert "recent_wrong_notes" in data
        assert "coaching_summary" in data

        # Verify types
        assert isinstance(data["overall_accuracy"], (int, float))
        assert isinstance(data["score_rate"], (int, float))
        assert isinstance(data["learning_volume"], int)
        assert isinstance(data["weak_concepts"], list)
        assert isinstance(data["accuracy_by_type"], list)
        assert isinstance(data["accuracy_by_subject"], list)
        assert isinstance(data["accuracy_by_file"], list)
        assert isinstance(data["retry_recommendations"], list)
        assert isinstance(data["recent_wrong_notes"], list)

    async def test_requires_auth(self, client: AsyncClient):
        resp = await client.get("/dashboard")
        assert resp.status_code == 401
