import uuid
import pytest

from app.services.quiz_service import (
    _normalize_text,
    _create_chunks,
    _update_weak_point,
)
from app.models.quiz import QuizItem, QuestionType, Judgement
from app.models.objection import WeakPoint


class TestNormalizeText:
    def test_basic_text(self):
        assert _normalize_text("hello world") == "hello world"

    def test_collapse_newlines(self):
        assert _normalize_text("line1\n\nline2") == "line1 line2"

    def test_collapse_carriage_returns(self):
        assert _normalize_text("line1\r\nline2\r\nline3") == "line1 line2 line3"

    def test_collapse_multiple_spaces(self):
        assert _normalize_text("hello   world") == "hello world"

    def test_strip(self):
        assert _normalize_text("  hello  ") == "hello"

    def test_mixed_whitespace(self):
        result = _normalize_text("  hello \n\n world  \n  ")
        assert result == "hello world"

    def test_empty_string(self):
        assert _normalize_text("") == ""

    def test_only_whitespace(self):
        assert _normalize_text("  \n  \r\n  ") == ""


class TestCreateChunks:
    def test_basic_chunking(self):
        text = "word " * 100
        chunks = _create_chunks("file-1", "doc-1", text, chunk_size=50, overlap=10)
        assert len(chunks) > 1
        assert all(c.file_id == "file-1" for c in chunks)
        assert all(c.parsed_document_id == "doc-1" for c in chunks)
        assert chunks[0].chunk_index == 0
        assert chunks[1].chunk_index == 1

    def test_single_chunk(self):
        text = "short text"
        chunks = _create_chunks("file-1", "doc-1", text, chunk_size=500, overlap=50)
        assert len(chunks) == 1
        assert chunks[0].text == "short text"
        assert chunks[0].token_count == 2

    def test_chunk_overlap(self):
        text = " ".join([f"word{i}" for i in range(100)])
        chunks = _create_chunks("f", "d", text, chunk_size=20, overlap=5)
        for i in range(len(chunks) - 1):
            words_curr = set(chunks[i].text.split())
            words_next = set(chunks[i + 1].text.split())
            overlap_words = words_curr & words_next
            assert len(overlap_words) > 0

    def test_chunk_ordering(self):
        text = " ".join([f"w{i}" for i in range(50)])
        chunks = _create_chunks("f", "d", text, chunk_size=10, overlap=2)
        for i, chunk in enumerate(chunks):
            assert chunk.chunk_index == i

    def test_default_parameters(self):
        text = "word " * 600
        chunks = _create_chunks("f", "d", text)
        assert all(c.is_active is True for c in chunks)
        assert all(c.embedding_status == "pending" for c in chunks)

    def test_empty_text(self):
        chunks = _create_chunks("f", "d", "", chunk_size=50, overlap=10)
        assert len(chunks) == 0


class TestUpdateWeakPoint:
    @pytest.mark.asyncio
    async def test_creates_new_weak_point_on_incorrect(self, db_session, test_user):
        item = QuizItem(
            id=str(uuid.uuid4()),
            quiz_session_id=str(uuid.uuid4()),
            item_order=1,
            question_type=QuestionType.multiple_choice,
            question_text="Test question",
            correct_answer_json={"answer": "A"},
            concept_key="test_concept",
            concept_label="Test Concept",
            category_tag="test",
        )
        await _update_weak_point(db_session, test_user.id, item, Judgement.incorrect)
        await db_session.commit()

        from sqlalchemy import select

        result = await db_session.execute(
            select(WeakPoint).where(
                WeakPoint.user_id == test_user.id,
                WeakPoint.concept_key == "test_concept",
            )
        )
        weak = result.scalar_one()
        assert weak.wrong_count == 1
        assert weak.streak_wrong_count == 1
        assert weak.last_wrong_at is not None

    @pytest.mark.asyncio
    async def test_increments_wrong_count(self, db_session, test_user):
        item = QuizItem(
            id=str(uuid.uuid4()),
            quiz_session_id=str(uuid.uuid4()),
            item_order=1,
            question_type=QuestionType.multiple_choice,
            question_text="Test",
            correct_answer_json={"answer": "A"},
            concept_key="inc_test",
            concept_label="Increment Test",
        )
        await _update_weak_point(db_session, test_user.id, item, Judgement.incorrect)
        await _update_weak_point(db_session, test_user.id, item, Judgement.incorrect)
        await db_session.commit()

        from sqlalchemy import select

        result = await db_session.execute(
            select(WeakPoint).where(WeakPoint.concept_key == "inc_test")
        )
        weak = result.scalar_one()
        assert weak.wrong_count == 2
        assert weak.streak_wrong_count == 2

    @pytest.mark.asyncio
    async def test_partial_resets_streak(self, db_session, test_user):
        item = QuizItem(
            id=str(uuid.uuid4()),
            quiz_session_id=str(uuid.uuid4()),
            item_order=1,
            question_type=QuestionType.multiple_choice,
            question_text="Test",
            correct_answer_json={"answer": "A"},
            concept_key="partial_test",
            concept_label="Partial Test",
        )
        await _update_weak_point(db_session, test_user.id, item, Judgement.incorrect)
        await _update_weak_point(db_session, test_user.id, item, Judgement.partial)
        await db_session.commit()

        from sqlalchemy import select

        result = await db_session.execute(
            select(WeakPoint).where(WeakPoint.concept_key == "partial_test")
        )
        weak = result.scalar_one()
        assert weak.wrong_count == 1
        assert weak.partial_count == 1
        assert weak.streak_wrong_count == 0

    @pytest.mark.asyncio
    async def test_correct_resets_streak(self, db_session, test_user):
        item = QuizItem(
            id=str(uuid.uuid4()),
            quiz_session_id=str(uuid.uuid4()),
            item_order=1,
            question_type=QuestionType.multiple_choice,
            question_text="Test",
            correct_answer_json={"answer": "A"},
            concept_key="correct_test",
            concept_label="Correct Test",
        )
        await _update_weak_point(db_session, test_user.id, item, Judgement.incorrect)
        await _update_weak_point(db_session, test_user.id, item, Judgement.correct)
        await db_session.commit()

        from sqlalchemy import select

        result = await db_session.execute(
            select(WeakPoint).where(WeakPoint.concept_key == "correct_test")
        )
        weak = result.scalar_one()
        assert weak.wrong_count == 1
        assert weak.streak_wrong_count == 0

    @pytest.mark.asyncio
    async def test_skipped_increments_skip_count(self, db_session, test_user):
        item = QuizItem(
            id=str(uuid.uuid4()),
            quiz_session_id=str(uuid.uuid4()),
            item_order=1,
            question_type=QuestionType.multiple_choice,
            question_text="Test",
            correct_answer_json={"answer": "A"},
            concept_key="skip_test",
            concept_label="Skip Test",
        )
        await _update_weak_point(db_session, test_user.id, item, Judgement.skipped)
        await db_session.commit()

        from sqlalchemy import select

        result = await db_session.execute(
            select(WeakPoint).where(WeakPoint.concept_key == "skip_test")
        )
        weak = result.scalar_one()
        assert weak.skip_count == 1

    @pytest.mark.asyncio
    async def test_empty_concept_key_skipped(self, db_session, test_user):
        item = QuizItem(
            id=str(uuid.uuid4()),
            quiz_session_id=str(uuid.uuid4()),
            item_order=1,
            question_type=QuestionType.multiple_choice,
            question_text="Test",
            correct_answer_json={"answer": "A"},
            concept_key="",
        )
        await _update_weak_point(db_session, test_user.id, item, Judgement.incorrect)
        await db_session.commit()

        from sqlalchemy import select, func

        count = await db_session.execute(select(func.count()).select_from(WeakPoint))
        assert count.scalar() == 0
