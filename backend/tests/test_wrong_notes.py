import uuid
from datetime import datetime, timezone

import pytest
from app.middleware.auth import hash_password
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
    ErrorType,
)
from app.models.user import User, UserRole


class TestListWrongNotes:
    @pytest.mark.asyncio
    async def test_list_wrong_notes_requires_auth(self, client, db_session):
        user = User(
            id=str(uuid.uuid4()),
            username="testuser",
            email="test@example.com",
            password_hash=hash_password("Test123!"),
            role=UserRole.user,
            is_active=True,
        )
        db_session.add(user)
        await db_session.commit()

        response = await client.get("/wrong-notes")
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_list_wrong_notes_returns_empty(self, auth_client):
        response = await auth_client.get("/wrong-notes")
        assert response.status_code == 200
        data = response.json()
        assert data["items"] == []
        assert data["total"] == 0
        assert data["page"] == 1
        assert data["size"] == 20

    @pytest.mark.asyncio
    async def test_list_wrong_notes_returns_items(
        self, auth_client, db_session, test_user
    ):
        session = QuizSession(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            mode=QuizMode.normal,
            source_mode=SourceMode.document_based,
            status=QuizSessionStatus.graded,
        )
        db_session.add(session)
        await db_session.flush()

        item = QuizItem(
            id=str(uuid.uuid4()),
            quiz_session_id=session.id,
            item_order=1,
            question_type=QuestionType.multiple_choice,
            question_text="What is X?",
            options_json={"choices": [{"label": "A", "text": "A"}]},
            correct_answer_json={"answer": "A"},
            concept_key="concept_x",
            concept_label="Concept X",
            category_tag="cat1",
        )
        db_session.add(item)
        await db_session.flush()

        log = AnswerLog(
            id=str(uuid.uuid4()),
            quiz_item_id=item.id,
            quiz_session_id=session.id,
            user_id=test_user.id,
            user_answer_raw="B",
            user_answer_normalized="b",
            judgement=Judgement.incorrect,
            score_awarded=0.0,
            max_score=1.0,
            error_type=ErrorType.concept_confusion,
            is_active_result=True,
            graded_at=datetime.now(timezone.utc),
        )
        db_session.add(log)
        await db_session.commit()

        response = await auth_client.get("/wrong-notes")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert len(data["items"]) == 1
        assert data["items"][0]["question_text"] == "What is X?"
        assert data["items"][0]["judgement"] == "incorrect"
        assert data["items"][0]["error_type"] == "concept_confusion"

    @pytest.mark.asyncio
    async def test_list_wrong_notes_excludes_no_source_sessions(
        self, auth_client, db_session, test_user
    ):
        session = QuizSession(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            mode=QuizMode.normal,
            source_mode=SourceMode.no_source,
            status=QuizSessionStatus.graded,
        )
        db_session.add(session)
        await db_session.flush()

        item = QuizItem(
            id=str(uuid.uuid4()),
            quiz_session_id=session.id,
            item_order=1,
            question_type=QuestionType.multiple_choice,
            question_text="No source question",
            correct_answer_json={"answer": "A"},
        )
        db_session.add(item)
        await db_session.flush()

        log = AnswerLog(
            id=str(uuid.uuid4()),
            quiz_item_id=item.id,
            quiz_session_id=session.id,
            user_id=test_user.id,
            judgement=Judgement.incorrect,
            score_awarded=0.0,
            max_score=1.0,
            error_type=ErrorType.concept_confusion,
            is_active_result=True,
            graded_at=datetime.now(timezone.utc),
        )
        db_session.add(log)
        await db_session.commit()

        response = await auth_client.get("/wrong-notes")
        assert response.status_code == 200
        assert response.json()["total"] == 0

    @pytest.mark.asyncio
    async def test_list_wrong_notes_excludes_inactive_results(
        self, auth_client, db_session, test_user
    ):
        session = QuizSession(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            mode=QuizMode.normal,
            source_mode=SourceMode.document_based,
            status=QuizSessionStatus.graded,
        )
        db_session.add(session)
        await db_session.flush()

        item = QuizItem(
            id=str(uuid.uuid4()),
            quiz_session_id=session.id,
            item_order=1,
            question_type=QuestionType.multiple_choice,
            question_text="Old attempt",
            correct_answer_json={"answer": "A"},
        )
        db_session.add(item)
        await db_session.flush()

        log = AnswerLog(
            id=str(uuid.uuid4()),
            quiz_item_id=item.id,
            quiz_session_id=session.id,
            user_id=test_user.id,
            judgement=Judgement.incorrect,
            score_awarded=0.0,
            max_score=1.0,
            error_type=ErrorType.concept_confusion,
            is_active_result=False,
            graded_at=datetime.now(timezone.utc),
        )
        db_session.add(log)
        await db_session.commit()

        response = await auth_client.get("/wrong-notes")
        assert response.status_code == 200
        assert response.json()["total"] == 0

    @pytest.mark.asyncio
    async def test_list_wrong_notes_filter_by_judgement(
        self, auth_client, db_session, test_user
    ):
        session = QuizSession(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            mode=QuizMode.normal,
            source_mode=SourceMode.document_based,
            status=QuizSessionStatus.graded,
        )
        db_session.add(session)
        await db_session.flush()

        for i, j in enumerate(
            [Judgement.incorrect, Judgement.partial, Judgement.skipped]
        ):
            item = QuizItem(
                id=str(uuid.uuid4()),
                quiz_session_id=session.id,
                item_order=i + 1,
                question_type=QuestionType.short_answer,
                question_text=f"Question {i}",
                correct_answer_json={"answer": "test"},
                concept_key=f"concept_{i}",
            )
            db_session.add(item)
            await db_session.flush()

            log = AnswerLog(
                id=str(uuid.uuid4()),
                quiz_item_id=item.id,
                quiz_session_id=session.id,
                user_id=test_user.id,
                judgement=j,
                score_awarded=0.0,
                max_score=1.0,
                error_type=ErrorType.concept_confusion,
                is_active_result=True,
                graded_at=datetime.now(timezone.utc),
            )
            db_session.add(log)
        await db_session.commit()

        response = await auth_client.get("/wrong-notes?judgement=incorrect")
        assert response.status_code == 200
        assert response.json()["total"] == 1

        response = await auth_client.get(
            "/wrong-notes?judgement=partial&judgement=skipped"
        )
        assert response.status_code == 200
        assert response.json()["total"] == 2

    @pytest.mark.asyncio
    async def test_list_wrong_notes_filter_by_error_type(
        self, auth_client, db_session, test_user
    ):
        session = QuizSession(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            mode=QuizMode.normal,
            source_mode=SourceMode.document_based,
            status=QuizSessionStatus.graded,
        )
        db_session.add(session)
        await db_session.flush()

        for i, et in enumerate(
            [
                ErrorType.concept_confusion,
                ErrorType.missing_keyword,
                ErrorType.reasoning_error,
            ]
        ):
            item = QuizItem(
                id=str(uuid.uuid4()),
                quiz_session_id=session.id,
                item_order=i + 1,
                question_type=QuestionType.short_answer,
                question_text=f"Q{i}",
                correct_answer_json={"answer": "test"},
                concept_key=f"c_{i}",
            )
            db_session.add(item)
            await db_session.flush()

            log = AnswerLog(
                id=str(uuid.uuid4()),
                quiz_item_id=item.id,
                quiz_session_id=session.id,
                user_id=test_user.id,
                judgement=Judgement.incorrect,
                score_awarded=0.0,
                max_score=1.0,
                error_type=et,
                is_active_result=True,
                graded_at=datetime.now(timezone.utc),
            )
            db_session.add(log)
        await db_session.commit()

        response = await auth_client.get("/wrong-notes?error_type=concept_confusion")
        assert response.status_code == 200
        assert response.json()["total"] == 1

    @pytest.mark.asyncio
    async def test_list_wrong_notes_filter_by_file_id(
        self, auth_client, db_session, test_user, ready_file
    ):
        session = QuizSession(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            mode=QuizMode.normal,
            source_mode=SourceMode.document_based,
            status=QuizSessionStatus.graded,
        )
        db_session.add(session)
        await db_session.flush()

        sf = QuizSessionFile(
            id=str(uuid.uuid4()),
            quiz_session_id=session.id,
            file_id=ready_file.id,
        )
        db_session.add(sf)

        item = QuizItem(
            id=str(uuid.uuid4()),
            quiz_session_id=session.id,
            item_order=1,
            question_type=QuestionType.multiple_choice,
            question_text="File-based question",
            correct_answer_json={"answer": "A"},
            concept_key="file_concept",
        )
        db_session.add(item)
        await db_session.flush()

        log = AnswerLog(
            id=str(uuid.uuid4()),
            quiz_item_id=item.id,
            quiz_session_id=session.id,
            user_id=test_user.id,
            judgement=Judgement.incorrect,
            score_awarded=0.0,
            max_score=1.0,
            error_type=ErrorType.concept_confusion,
            is_active_result=True,
            graded_at=datetime.now(timezone.utc),
        )
        db_session.add(log)
        await db_session.commit()

        response = await auth_client.get(f"/wrong-notes?file_id={ready_file.id}")
        assert response.status_code == 200
        assert response.json()["total"] == 1

        response = await auth_client.get("/wrong-notes?file_id=nonexistent-id")
        assert response.status_code == 200
        assert response.json()["total"] == 0

    @pytest.mark.asyncio
    async def test_list_wrong_notes_filter_by_category_tag(
        self, auth_client, db_session, test_user
    ):
        session = QuizSession(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            mode=QuizMode.normal,
            source_mode=SourceMode.document_based,
            status=QuizSessionStatus.graded,
        )
        db_session.add(session)
        await db_session.flush()

        for tag in ["math", "science"]:
            item = QuizItem(
                id=str(uuid.uuid4()),
                quiz_session_id=session.id,
                item_order=1 if tag == "math" else 2,
                question_type=QuestionType.short_answer,
                question_text=f"{tag} question",
                correct_answer_json={"answer": "test"},
                concept_key=f"{tag}_concept",
                category_tag=tag,
            )
            db_session.add(item)
            await db_session.flush()

            log = AnswerLog(
                id=str(uuid.uuid4()),
                quiz_item_id=item.id,
                quiz_session_id=session.id,
                user_id=test_user.id,
                judgement=Judgement.incorrect,
                score_awarded=0.0,
                max_score=1.0,
                error_type=ErrorType.concept_confusion,
                is_active_result=True,
                graded_at=datetime.now(timezone.utc),
            )
            db_session.add(log)
        await db_session.commit()

        response = await auth_client.get("/wrong-notes?category_tag=math")
        assert response.status_code == 200
        assert response.json()["total"] == 1

    @pytest.mark.asyncio
    async def test_list_wrong_notes_pagination(
        self, auth_client, db_session, test_user
    ):
        session = QuizSession(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            mode=QuizMode.normal,
            source_mode=SourceMode.document_based,
            status=QuizSessionStatus.graded,
        )
        db_session.add(session)
        await db_session.flush()

        for i in range(5):
            item = QuizItem(
                id=str(uuid.uuid4()),
                quiz_session_id=session.id,
                item_order=i + 1,
                question_type=QuestionType.short_answer,
                question_text=f"Q{i}",
                correct_answer_json={"answer": "test"},
                concept_key=f"c_{i}",
            )
            db_session.add(item)
            await db_session.flush()

            log = AnswerLog(
                id=str(uuid.uuid4()),
                quiz_item_id=item.id,
                quiz_session_id=session.id,
                user_id=test_user.id,
                judgement=Judgement.incorrect,
                score_awarded=0.0,
                max_score=1.0,
                error_type=ErrorType.concept_confusion,
                is_active_result=True,
                graded_at=datetime.now(timezone.utc),
            )
            db_session.add(log)
        await db_session.commit()

        response = await auth_client.get("/wrong-notes?page=1&size=2")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 5
        assert len(data["items"]) == 2
        assert data["page"] == 1

        response = await auth_client.get("/wrong-notes?page=3&size=2")
        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) == 1

    @pytest.mark.asyncio
    async def test_list_wrong_notes_sort_by_concept(
        self, auth_client, db_session, test_user
    ):
        session = QuizSession(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            mode=QuizMode.normal,
            source_mode=SourceMode.document_based,
            status=QuizSessionStatus.graded,
        )
        db_session.add(session)
        await db_session.flush()

        for concept in ["zebra", "alpha", "middle"]:
            item = QuizItem(
                id=str(uuid.uuid4()),
                quiz_session_id=session.id,
                item_order=1,
                question_type=QuestionType.short_answer,
                question_text=f"{concept} question",
                correct_answer_json={"answer": "test"},
                concept_key=concept,
            )
            db_session.add(item)
            await db_session.flush()

            log = AnswerLog(
                id=str(uuid.uuid4()),
                quiz_item_id=item.id,
                quiz_session_id=session.id,
                user_id=test_user.id,
                judgement=Judgement.incorrect,
                score_awarded=0.0,
                max_score=1.0,
                error_type=ErrorType.concept_confusion,
                is_active_result=True,
                graded_at=datetime.now(timezone.utc),
            )
            db_session.add(log)
        await db_session.commit()

        response = await auth_client.get("/wrong-notes?sort=concept")
        assert response.status_code == 200
        items = response.json()["items"]
        assert items[0]["concept_key"] == "alpha"

    @pytest.mark.asyncio
    async def test_list_wrong_notes_sort_by_date(
        self, auth_client, db_session, test_user
    ):
        session = QuizSession(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            mode=QuizMode.normal,
            source_mode=SourceMode.document_based,
            status=QuizSessionStatus.graded,
        )
        db_session.add(session)
        await db_session.flush()

        for i in range(3):
            item = QuizItem(
                id=str(uuid.uuid4()),
                quiz_session_id=session.id,
                item_order=1,
                question_type=QuestionType.short_answer,
                question_text=f"Q{i}",
                correct_answer_json={"answer": "test"},
                concept_key=f"c_{i}",
            )
            db_session.add(item)
            await db_session.flush()

            log = AnswerLog(
                id=str(uuid.uuid4()),
                quiz_item_id=item.id,
                quiz_session_id=session.id,
                user_id=test_user.id,
                judgement=Judgement.incorrect,
                score_awarded=0.0,
                max_score=1.0,
                error_type=ErrorType.concept_confusion,
                is_active_result=True,
                graded_at=datetime(2024, 1, i + 1, tzinfo=timezone.utc),
            )
            db_session.add(log)
        await db_session.commit()

        response = await auth_client.get("/wrong-notes?sort=date")
        assert response.status_code == 200
        items = response.json()["items"]
        # Most recent first (Jan 3 > Jan 2 > Jan 1)
        assert "2024-01-03" in items[0]["graded_at"]

    @pytest.mark.asyncio
    async def test_list_wrong_notes_sort_by_question(
        self, auth_client, db_session, test_user
    ):
        session = QuizSession(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            mode=QuizMode.normal,
            source_mode=SourceMode.document_based,
            status=QuizSessionStatus.graded,
        )
        db_session.add(session)
        await db_session.flush()

        for text in ["Zebra question", "Alpha question", "Middle question"]:
            item = QuizItem(
                id=str(uuid.uuid4()),
                quiz_session_id=session.id,
                item_order=1,
                question_type=QuestionType.short_answer,
                question_text=text,
                correct_answer_json={"answer": "test"},
                concept_key=f"c_{text[:3]}",
            )
            db_session.add(item)
            await db_session.flush()

            log = AnswerLog(
                id=str(uuid.uuid4()),
                quiz_item_id=item.id,
                quiz_session_id=session.id,
                user_id=test_user.id,
                judgement=Judgement.incorrect,
                score_awarded=0.0,
                max_score=1.0,
                error_type=ErrorType.concept_confusion,
                is_active_result=True,
                graded_at=datetime.now(timezone.utc),
            )
            db_session.add(log)
        await db_session.commit()

        response = await auth_client.get("/wrong-notes?sort=question")
        assert response.status_code == 200
        items = response.json()["items"]
        assert "Alpha" in items[0]["question_text"]

    @pytest.mark.asyncio
    async def test_list_wrong_notes_only_returns_user_own_notes(
        self, auth_client, db_session, test_user
    ):
        # Create another user's session
        other_user_id = str(uuid.uuid4())
        session = QuizSession(
            id=str(uuid.uuid4()),
            user_id=other_user_id,
            mode=QuizMode.normal,
            source_mode=SourceMode.document_based,
            status=QuizSessionStatus.graded,
        )
        db_session.add(session)
        await db_session.flush()

        item = QuizItem(
            id=str(uuid.uuid4()),
            quiz_session_id=session.id,
            item_order=1,
            question_type=QuestionType.short_answer,
            question_text="Other user question",
            correct_answer_json={"answer": "test"},
            concept_key="other_concept",
        )
        db_session.add(item)
        await db_session.flush()

        log = AnswerLog(
            id=str(uuid.uuid4()),
            quiz_item_id=item.id,
            quiz_session_id=session.id,
            user_id=other_user_id,
            judgement=Judgement.incorrect,
            score_awarded=0.0,
            max_score=1.0,
            error_type=ErrorType.concept_confusion,
            is_active_result=True,
            graded_at=datetime.now(timezone.utc),
        )
        db_session.add(log)
        await db_session.commit()

        response = await auth_client.get("/wrong-notes")
        assert response.status_code == 200
        assert response.json()["total"] == 0

    @pytest.mark.asyncio
    async def test_list_wrong_notes_includes_file_info(
        self, auth_client, db_session, test_user, ready_file
    ):
        session = QuizSession(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            mode=QuizMode.normal,
            source_mode=SourceMode.document_based,
            status=QuizSessionStatus.graded,
        )
        db_session.add(session)
        await db_session.flush()

        sf = QuizSessionFile(
            id=str(uuid.uuid4()),
            quiz_session_id=session.id,
            file_id=ready_file.id,
        )
        db_session.add(sf)

        item = QuizItem(
            id=str(uuid.uuid4()),
            quiz_session_id=session.id,
            item_order=1,
            question_type=QuestionType.multiple_choice,
            question_text="Question with file",
            correct_answer_json={"answer": "A"},
            concept_key="file_concept",
        )
        db_session.add(item)
        await db_session.flush()

        log = AnswerLog(
            id=str(uuid.uuid4()),
            quiz_item_id=item.id,
            quiz_session_id=session.id,
            user_id=test_user.id,
            judgement=Judgement.incorrect,
            score_awarded=0.0,
            max_score=1.0,
            error_type=ErrorType.concept_confusion,
            is_active_result=True,
            graded_at=datetime.now(timezone.utc),
        )
        db_session.add(log)
        await db_session.commit()

        response = await auth_client.get("/wrong-notes")
        assert response.status_code == 200
        data = response.json()
        item_data = data["items"][0]
        assert item_data["file_id"] == ready_file.id
        assert item_data["original_filename"] == "test.pdf"


class TestUpdateErrorType:
    @pytest.mark.asyncio
    async def test_update_error_type_requires_auth(self, client, db_session):
        log_id = str(uuid.uuid4())
        response = await client.patch(
            f"/wrong-notes/{log_id}/error-type",
            json={"error_type": "careless_mistake"},
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_update_error_type_not_found(self, auth_client):
        response = await auth_client.patch(
            "/wrong-notes/nonexistent-id/error-type",
            json={"error_type": "careless_mistake"},
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_update_error_type_success(self, auth_client, db_session, test_user):
        session = QuizSession(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            mode=QuizMode.normal,
            source_mode=SourceMode.document_based,
            status=QuizSessionStatus.graded,
        )
        db_session.add(session)
        await db_session.flush()

        item = QuizItem(
            id=str(uuid.uuid4()),
            quiz_session_id=session.id,
            item_order=1,
            question_type=QuestionType.short_answer,
            question_text="Test question",
            correct_answer_json={"answer": "test"},
            concept_key="test_concept",
        )
        db_session.add(item)
        await db_session.flush()

        log = AnswerLog(
            id=str(uuid.uuid4()),
            quiz_item_id=item.id,
            quiz_session_id=session.id,
            user_id=test_user.id,
            judgement=Judgement.incorrect,
            score_awarded=0.0,
            max_score=1.0,
            error_type=ErrorType.concept_confusion,
            is_active_result=True,
            graded_at=datetime.now(timezone.utc),
        )
        db_session.add(log)
        await db_session.commit()

        response = await auth_client.patch(
            f"/wrong-notes/{log.id}/error-type",
            json={"error_type": "careless_mistake"},
        )
        assert response.status_code == 200
        assert response.json()["status"] == "success"

    @pytest.mark.asyncio
    async def test_update_error_type_to_no_response(
        self, auth_client, db_session, test_user
    ):
        session = QuizSession(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            mode=QuizMode.normal,
            source_mode=SourceMode.document_based,
            status=QuizSessionStatus.graded,
        )
        db_session.add(session)
        await db_session.flush()

        item = QuizItem(
            id=str(uuid.uuid4()),
            quiz_session_id=session.id,
            item_order=1,
            question_type=QuestionType.short_answer,
            question_text="Test question",
            correct_answer_json={"answer": "test"},
            concept_key="test_concept",
        )
        db_session.add(item)
        await db_session.flush()

        log = AnswerLog(
            id=str(uuid.uuid4()),
            quiz_item_id=item.id,
            quiz_session_id=session.id,
            user_id=test_user.id,
            judgement=Judgement.incorrect,
            score_awarded=0.0,
            max_score=1.0,
            error_type=ErrorType.concept_confusion,
            is_active_result=True,
            graded_at=datetime.now(timezone.utc),
        )
        db_session.add(log)
        await db_session.commit()

        response = await auth_client.patch(
            f"/wrong-notes/{log.id}/error-type",
            json={"error_type": "no_response"},
        )
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_update_error_type_rejected_for_disallowed_type(
        self, auth_client, db_session, test_user
    ):
        session = QuizSession(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            mode=QuizMode.normal,
            source_mode=SourceMode.document_based,
            status=QuizSessionStatus.graded,
        )
        db_session.add(session)
        await db_session.flush()

        item = QuizItem(
            id=str(uuid.uuid4()),
            quiz_session_id=session.id,
            item_order=1,
            question_type=QuestionType.short_answer,
            question_text="Test question",
            correct_answer_json={"answer": "test"},
            concept_key="test_concept",
        )
        db_session.add(item)
        await db_session.flush()

        log = AnswerLog(
            id=str(uuid.uuid4()),
            quiz_item_id=item.id,
            quiz_session_id=session.id,
            user_id=test_user.id,
            judgement=Judgement.incorrect,
            score_awarded=0.0,
            max_score=1.0,
            error_type=ErrorType.concept_confusion,
            is_active_result=True,
            graded_at=datetime.now(timezone.utc),
        )
        db_session.add(log)
        await db_session.commit()

        # concept_confusion cannot be set by user (only careless_mistake and no_response)
        response = await auth_client.patch(
            f"/wrong-notes/{log.id}/error-type",
            json={"error_type": "concept_confusion"},
        )
        assert response.status_code == 400
        assert "Only careless_mistake and no_response" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_update_error_type_cannot_modify_others(
        self, auth_client, db_session, test_user
    ):
        other_user_id = str(uuid.uuid4())
        session = QuizSession(
            id=str(uuid.uuid4()),
            user_id=other_user_id,
            mode=QuizMode.normal,
            source_mode=SourceMode.document_based,
            status=QuizSessionStatus.graded,
        )
        db_session.add(session)
        await db_session.flush()

        item = QuizItem(
            id=str(uuid.uuid4()),
            quiz_session_id=session.id,
            item_order=1,
            question_type=QuestionType.short_answer,
            question_text="Other user question",
            correct_answer_json={"answer": "test"},
            concept_key="other_concept",
        )
        db_session.add(item)
        await db_session.flush()

        log = AnswerLog(
            id=str(uuid.uuid4()),
            quiz_item_id=item.id,
            quiz_session_id=session.id,
            user_id=other_user_id,
            judgement=Judgement.incorrect,
            score_awarded=0.0,
            max_score=1.0,
            error_type=ErrorType.concept_confusion,
            is_active_result=True,
            graded_at=datetime.now(timezone.utc),
        )
        db_session.add(log)
        await db_session.commit()

        response = await auth_client.patch(
            f"/wrong-notes/{log.id}/error-type",
            json={"error_type": "careless_mistake"},
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_update_error_type_cannot_modify_inactive(
        self, auth_client, db_session, test_user
    ):
        session = QuizSession(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            mode=QuizMode.normal,
            source_mode=SourceMode.document_based,
            status=QuizSessionStatus.graded,
        )
        db_session.add(session)
        await db_session.flush()

        item = QuizItem(
            id=str(uuid.uuid4()),
            quiz_session_id=session.id,
            item_order=1,
            question_type=QuestionType.short_answer,
            question_text="Test question",
            correct_answer_json={"answer": "test"},
            concept_key="test_concept",
        )
        db_session.add(item)
        await db_session.flush()

        log = AnswerLog(
            id=str(uuid.uuid4()),
            quiz_item_id=item.id,
            quiz_session_id=session.id,
            user_id=test_user.id,
            judgement=Judgement.incorrect,
            score_awarded=0.0,
            max_score=1.0,
            error_type=ErrorType.concept_confusion,
            is_active_result=False,
            graded_at=datetime.now(timezone.utc),
        )
        db_session.add(log)
        await db_session.commit()

        response = await auth_client.patch(
            f"/wrong-notes/{log.id}/error-type",
            json={"error_type": "careless_mistake"},
        )
        assert response.status_code == 404
