import pytest
from pydantic import ValidationError

from app.schemas.auth import (
    SignupRequest,
    LoginRequest,
    PasswordResetConfirm,
    RefreshTokenRequest,
)
from app.schemas.quiz import (
    QuizSessionCreate,
    AnswerSubmit,
    DraftAnswerSubmit,
    ExamSubmit,
    QuizItemResponse,
)
from app.schemas.objection import ObjectionCreate
from app.schemas.retry import RetrySetCreate
from app.schemas.search import SearchQuery
from app.schemas.dashboard import DashboardQuery
from app.schemas.admin import (
    MasterPasswordVerify,
    AnnouncementCreate,
    ImpersonationStart,
)
from app.schemas.wrong_note import WrongNoteItem, WrongNoteErrorTypeUpdate


# ── SignupRequest ──────────────────────────────────────────────


class TestSignupRequest:
    def test_valid(self):
        req = SignupRequest(
            username="john_doe", email="john@example.com", password="Str0ngP@ss"
        )
        assert req.username == "john_doe"
        assert req.email == "john@example.com"

    def test_username_too_short(self):
        with pytest.raises(ValidationError) as exc_info:
            SignupRequest(username="ab", email="a@b.com", password="Str0ngP@ss")
        assert "username" in str(exc_info.value)

    def test_invalid_email(self):
        with pytest.raises(ValidationError) as exc_info:
            SignupRequest(
                username="john_doe", email="not-an-email", password="Str0ngP@ss"
            )
        assert "email" in str(exc_info.value)

    def test_weak_password(self):
        with pytest.raises(ValidationError) as exc_info:
            SignupRequest(
                username="john_doe", email="john@example.com", password="short"
            )
        assert "password" in str(exc_info.value)

    def test_username_with_special_chars(self):
        with pytest.raises(ValidationError) as exc_info:
            SignupRequest(
                username="john@doe!", email="john@example.com", password="Str0ngP@ss"
            )
        assert "username" in str(exc_info.value)


# ── LoginRequest ───────────────────────────────────────────────


class TestLoginRequest:
    def test_valid(self):
        req = LoginRequest(username_or_email="testuser", password="somepass")
        assert req.username_or_email == "testuser"

    def test_empty_username_or_email(self):
        with pytest.raises(ValidationError) as exc_info:
            LoginRequest(username_or_email="", password="somepass")
        assert "username_or_email" in str(exc_info.value)


# ── PasswordResetConfirm ──────────────────────────────────────


class TestPasswordResetConfirm:
    def test_valid(self):
        req = PasswordResetConfirm(token="abc123token", new_password="NewStr0ng!")
        assert req.token == "abc123token"

    def test_short_token(self):
        with pytest.raises(ValidationError) as exc_info:
            PasswordResetConfirm(token="", new_password="NewStr0ng!")
        assert "token" in str(exc_info.value)

    def test_weak_new_password(self):
        with pytest.raises(ValidationError) as exc_info:
            PasswordResetConfirm(token="abc123token", new_password="short")
        assert "new_password" in str(exc_info.value)


# ── RefreshTokenRequest ───────────────────────────────────────


class TestRefreshTokenRequest:
    def test_valid(self):
        req = RefreshTokenRequest(refresh_token="some-long-token-value")
        assert req.refresh_token == "some-long-token-value"

    def test_empty_token(self):
        with pytest.raises(ValidationError) as exc_info:
            RefreshTokenRequest(refresh_token="")
        assert "refresh_token" in str(exc_info.value)


# ── QuizSessionCreate ─────────────────────────────────────────


class TestQuizSessionCreate:
    def test_valid_with_defaults(self):
        req = QuizSessionCreate(mode="normal", source_mode="document_based")
        assert req.question_count is None
        assert req.selected_file_ids == []

    def test_valid_with_explicit_count(self):
        req = QuizSessionCreate(mode="exam", source_mode="no_source", question_count=10)
        assert req.question_count == 10

    def test_mode_validation(self):
        with pytest.raises(ValidationError):
            QuizSessionCreate(mode="invalid_mode", source_mode="document_based")

    def test_source_mode_validation(self):
        with pytest.raises(ValidationError):
            QuizSessionCreate(mode="normal", source_mode="invalid_source")


# ── AnswerSubmit ───────────────────────────────────────────────


class TestAnswerSubmit:
    def test_valid(self):
        req = AnswerSubmit(user_answer="My answer text")
        assert req.user_answer == "My answer text"

    def test_answer_too_long(self):
        with pytest.raises(ValidationError):
            AnswerSubmit(user_answer="x" * 10001)


# ── DraftAnswerSubmit ──────────────────────────────────────────


class TestDraftAnswerSubmit:
    def test_valid(self):
        req = DraftAnswerSubmit(item_id="abc-123", user_answer="draft answer")
        assert req.item_id == "abc-123"
        assert req.user_answer == "draft answer"


# ── ExamSubmit ─────────────────────────────────────────────────


class TestExamSubmit:
    def test_valid(self):
        req = ExamSubmit(idempotency_key="unique-key-123")
        assert req.idempotency_key == "unique-key-123"


# ── ObjectionCreate ────────────────────────────────────────────


class TestObjectionCreate:
    def test_valid(self):
        req = ObjectionCreate(
            answer_log_id="log-123", objection_reason="I think my answer is correct"
        )
        assert req.objection_reason == "I think my answer is correct"

    def test_empty_reason(self):
        with pytest.raises(ValidationError):
            ObjectionCreate(answer_log_id="log-123", objection_reason="")

    def test_reason_too_long(self):
        with pytest.raises(ValidationError):
            ObjectionCreate(answer_log_id="log-123", objection_reason="x" * 5001)


# ── RetrySetCreate ─────────────────────────────────────────────


class TestRetrySetCreate:
    def test_valid(self):
        req = RetrySetCreate(source="wrong_notes")
        assert req.size == 5
        assert req.concept_keys is None

    def test_invalid_source_literal(self):
        with pytest.raises(ValidationError):
            RetrySetCreate(source="invalid_source")

    def test_size_zero_fails(self):
        with pytest.raises(ValidationError):
            RetrySetCreate(source="wrong_notes", size=0)

    def test_size_51_fails(self):
        with pytest.raises(ValidationError):
            RetrySetCreate(source="wrong_notes", size=51)


# ── SearchQuery ────────────────────────────────────────────────


class TestSearchQuery:
    def test_valid_with_defaults(self):
        req = SearchQuery(q="test query")
        assert req.page == 1
        assert req.size == 20

    def test_default_scope_is_all(self):
        req = SearchQuery(q="test")
        assert req.scope == "all"


# ── DashboardQuery ─────────────────────────────────────────────


class TestDashboardQuery:
    def test_valid_with_defaults(self):
        req = DashboardQuery()
        assert req.range == "7d"
        assert req.file_id is None
        assert req.category_tag is None


# ── MasterPasswordVerify ──────────────────────────────────────


class TestMasterPasswordVerify:
    def test_valid(self):
        req = MasterPasswordVerify(master_password="my-secret")
        assert req.master_password == "my-secret"

    def test_empty_password(self):
        with pytest.raises(ValidationError):
            MasterPasswordVerify(master_password="")


# ── AnnouncementCreate ─────────────────────────────────────────


class TestAnnouncementCreate:
    def test_valid(self):
        req = AnnouncementCreate(title="Hello", body="World body text")
        assert req.title == "Hello"
        assert req.is_active is False

    def test_empty_title(self):
        with pytest.raises(ValidationError):
            AnnouncementCreate(title="", body="Body text")

    def test_empty_body(self):
        with pytest.raises(ValidationError):
            AnnouncementCreate(title="Title", body="")


# ── ImpersonationStart ────────────────────────────────────────


class TestImpersonationStart:
    def test_valid(self):
        req = ImpersonationStart(
            target_user_id="user-abc-123", reason="Support request"
        )
        assert req.target_user_id == "user-abc-123"

    def test_empty_reason(self):
        with pytest.raises(ValidationError):
            ImpersonationStart(target_user_id="user-abc-123", reason="")


# ── WrongNoteErrorTypeUpdate ──────────────────────────────────


class TestWrongNoteErrorTypeUpdate:
    def test_valid(self):
        req = WrongNoteErrorTypeUpdate(error_type="concept_confusion")
        assert req.error_type == "concept_confusion"


# ── QuizItemResponse field_validator (options normalization) ──


class TestQuizItemResponseNormalization:
    def test_options_list_normalized_to_dict(self):
        item = QuizItemResponse(
            id="item-1",
            item_order=1,
            question_type="multiple_choice",
            question_text="What?",
            options=["A", "B", "C"],
        )
        assert isinstance(item.options, dict)
        assert item.options == {"options": ["A", "B", "C"]}


# ── WrongNoteItem field_validators ────────────────────────────


class TestWrongNoteItemNormalization:
    def test_options_list_normalized(self):
        from datetime import datetime

        item = WrongNoteItem(
            id="wn-1",
            question_text="What?",
            question_type="multiple_choice",
            options=["A", "B"],
            correct_answer={"answer": "A"},
            judgement="incorrect",
            score_awarded=0.0,
            max_score=1.0,
            created_at=datetime(2025, 1, 1),
        )
        assert isinstance(item.options, dict)
        assert item.options == {"options": ["A", "B"]}

    def test_correct_answer_string_normalized(self):
        from datetime import datetime

        item = WrongNoteItem(
            id="wn-2",
            question_text="What?",
            question_type="short_answer",
            correct_answer="plain string answer",
            judgement="correct",
            score_awarded=1.0,
            max_score=1.0,
            created_at=datetime(2025, 1, 1),
        )
        assert isinstance(item.correct_answer, dict)
        assert item.correct_answer == {"answer": "plain string answer"}
