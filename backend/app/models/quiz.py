import enum
from datetime import datetime
from sqlalchemy import (
    String,
    Text,
    Integer,
    Float,
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    JSON,
    Index,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base, CommonMixin


class QuizMode(str, enum.Enum):
    normal = "normal"
    exam = "exam"


class SourceMode(str, enum.Enum):
    document_based = "document_based"
    no_source = "no_source"


class QuizSessionStatus(str, enum.Enum):
    draft = "draft"
    generating = "generating"
    ready = "ready"
    in_progress = "in_progress"
    submitted = "submitted"
    grading = "grading"
    graded = "graded"
    objection_pending = "objection_pending"
    regraded = "regraded"
    closed = "closed"
    generation_failed = "generation_failed"


class QuestionType(str, enum.Enum):
    multiple_choice = "multiple_choice"
    ox = "ox"
    short_answer = "short_answer"
    fill_blank = "fill_blank"
    essay = "essay"


class Judgement(str, enum.Enum):
    correct = "correct"
    partial = "partial"
    incorrect = "incorrect"
    skipped = "skipped"


class ErrorType(str, enum.Enum):
    concept_confusion = "concept_confusion"
    missing_keyword = "missing_keyword"
    expression_mismatch = "expression_mismatch"
    careless_mistake = "careless_mistake"
    ambiguous_question = "ambiguous_question"
    insufficient_source = "insufficient_source"
    reasoning_error = "reasoning_error"
    no_response = "no_response"


class QuizSession(CommonMixin, Base):
    __tablename__ = "quiz_sessions"

    user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=True
    )
    guest_session_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("guest_sessions.id", ondelete="CASCADE"), nullable=True
    )
    title: Mapped[str | None] = mapped_column(String(200), nullable=True)
    mode: Mapped[QuizMode] = mapped_column(Enum(QuizMode), nullable=False)
    source_mode: Mapped[SourceMode] = mapped_column(Enum(SourceMode), nullable=False)
    status: Mapped[QuizSessionStatus] = mapped_column(
        Enum(QuizSessionStatus), default=QuizSessionStatus.draft, nullable=False
    )
    difficulty: Mapped[str | None] = mapped_column(String(20), nullable=True)
    question_count: Mapped[int | None] = mapped_column(
        Integer, nullable=True, default=None
    )
    generation_priority: Mapped[str | None] = mapped_column(String(50), nullable=True)
    generation_model_name: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    submitted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    graded_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    total_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    idempotency_key: Mapped[str | None] = mapped_column(
        String(100), nullable=True, unique=True
    )
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    updated_by: Mapped[str | None] = mapped_column(String(36), nullable=True)

    __table_args__ = (Index("ix_quiz_sessions_idempotency", "idempotency_key"),)

    items = relationship("QuizItem", back_populates="session", lazy="selectin")
    session_files = relationship(
        "QuizSessionFile", back_populates="session", lazy="selectin"
    )


class QuizSessionFile(CommonMixin, Base):
    __tablename__ = "quiz_session_files"

    quiz_session_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("quiz_sessions.id", ondelete="CASCADE"), nullable=False
    )
    file_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("files.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(50), default="active")
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    updated_by: Mapped[str | None] = mapped_column(String(36), nullable=True)

    session = relationship("QuizSession", back_populates="session_files")
    file = relationship("File")


class QuizItem(CommonMixin, Base):
    __tablename__ = "quiz_items"

    quiz_session_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("quiz_sessions.id", ondelete="CASCADE"), nullable=False
    )
    item_order: Mapped[int] = mapped_column(Integer, nullable=False)
    question_type: Mapped[QuestionType] = mapped_column(
        Enum(QuestionType), nullable=False
    )
    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    options_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    option_descriptions_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    correct_answer_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    explanation_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    tips_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_refs_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    concept_key: Mapped[str | None] = mapped_column(String(200), nullable=True)
    concept_label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    category_tag: Mapped[str | None] = mapped_column(String(100), nullable=True)
    difficulty: Mapped[str | None] = mapped_column(String(20), nullable=True)
    similarity_fingerprint: Mapped[str | None] = mapped_column(
        String(64), nullable=True
    )
    generation_trace_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="active")
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    updated_by: Mapped[str | None] = mapped_column(String(36), nullable=True)

    __table_args__ = (
        Index("ix_quiz_items_session_order", "quiz_session_id", "item_order"),
        Index("ix_quiz_items_concept", "concept_key"),
    )

    session = relationship("QuizSession", back_populates="items")
    answer_logs = relationship("AnswerLog", back_populates="quiz_item", lazy="selectin")


class AnswerLog(CommonMixin, Base):
    __tablename__ = "answer_logs"

    quiz_item_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("quiz_items.id", ondelete="CASCADE"), nullable=False
    )
    quiz_session_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("quiz_sessions.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=True
    )
    guest_session_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("guest_sessions.id", ondelete="CASCADE"), nullable=True
    )
    user_answer_raw: Mapped[str | None] = mapped_column(Text, nullable=True)
    user_answer_normalized: Mapped[str | None] = mapped_column(Text, nullable=True)
    judgement: Mapped[Judgement] = mapped_column(Enum(Judgement), nullable=False)
    score_awarded: Mapped[float] = mapped_column(Float, default=0.0)
    max_score: Mapped[float] = mapped_column(Float, default=1.0)
    grading_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    grading_rationale: Mapped[str | None] = mapped_column(Text, nullable=True)
    missing_points_json: Mapped[list | None] = mapped_column(JSON, nullable=True)
    error_type: Mapped[ErrorType | None] = mapped_column(Enum(ErrorType), nullable=True)
    is_active_result: Mapped[bool] = mapped_column(Boolean, default=True)
    graded_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    regraded_from_answer_log_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("answer_logs.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(50), default="active")
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    updated_by: Mapped[str | None] = mapped_column(String(36), nullable=True)

    __table_args__ = (
        Index("ix_answer_logs_active", "quiz_item_id", "is_active_result"),
        Index("ix_answer_logs_user_active", "user_id", "is_active_result"),
    )

    quiz_item = relationship("QuizItem", back_populates="answer_logs")
