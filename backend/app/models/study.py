import enum
from datetime import datetime
from sqlalchemy import (
    String,
    Text,
    Integer,
    DateTime,
    Enum,
    ForeignKey,
    JSON,
    Index,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base, CommonMixin


class ContentStatus(str, enum.Enum):
    not_generated = "not_generated"
    generating = "generating"
    completed = "completed"
    failed = "failed"


class MessageRole(str, enum.Enum):
    user = "user"
    assistant = "assistant"


class StudySummary(CommonMixin, Base):
    __tablename__ = "study_summaries"

    file_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("files.id", ondelete="CASCADE"), nullable=False
    )
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[ContentStatus] = mapped_column(
        Enum(ContentStatus, native_enum=False),
        default=ContentStatus.not_generated,
        nullable=False,
    )
    generated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    model_used: Mapped[str | None] = mapped_column(String(100), nullable=True)

    file = relationship("File")


class StudyFlashcardSet(CommonMixin, Base):
    __tablename__ = "study_flashcard_sets"

    file_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("files.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[ContentStatus] = mapped_column(
        Enum(ContentStatus, native_enum=False),
        default=ContentStatus.not_generated,
        nullable=False,
    )
    generated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    model_used: Mapped[str | None] = mapped_column(String(100), nullable=True)

    file = relationship("File")
    flashcards = relationship("StudyFlashcard", back_populates="flashcard_set")


class StudyFlashcard(CommonMixin, Base):
    __tablename__ = "study_flashcards"

    flashcard_set_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("study_flashcard_sets.id", ondelete="CASCADE"),
        nullable=False,
    )
    front: Mapped[str] = mapped_column(Text, nullable=False)
    back: Mapped[str] = mapped_column(Text, nullable=False)
    order: Mapped[int] = mapped_column(Integer, nullable=False)

    flashcard_set = relationship("StudyFlashcardSet", back_populates="flashcards")


class StudyMindmap(CommonMixin, Base):
    __tablename__ = "study_mindmaps"

    file_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("files.id", ondelete="CASCADE"), nullable=False
    )
    data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    status: Mapped[ContentStatus] = mapped_column(
        Enum(ContentStatus, native_enum=False),
        default=ContentStatus.not_generated,
        nullable=False,
    )
    generated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    model_used: Mapped[str | None] = mapped_column(String(100), nullable=True)

    file = relationship("File")


class StudyChat(CommonMixin, Base):
    __tablename__ = "study_chats"

    file_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("files.id", ondelete="CASCADE"), nullable=False
    )

    file = relationship("File")
    messages = relationship("StudyMessage", back_populates="chat")


class StudyMessage(CommonMixin, Base):
    __tablename__ = "study_messages"

    chat_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("study_chats.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[MessageRole] = mapped_column(
        Enum(MessageRole, native_enum=False), nullable=False
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    page_context: Mapped[int | None] = mapped_column(Integer, nullable=True)

    chat = relationship("StudyChat", back_populates="messages")


class StudyVisit(CommonMixin, Base):
    __tablename__ = "study_visits"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    file_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("files.id", ondelete="CASCADE"), nullable=False
    )
    last_visited_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    visit_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    __table_args__ = (
        UniqueConstraint("user_id", "file_id", name="uq_study_visits_user_file"),
        Index("ix_study_visits_user_last_visited", "user_id", "last_visited_at"),
    )


class StudyItemSet(CommonMixin, Base):
    """One generated batch of /study items for a (file_id, item_type, difficulty).

    item_type    : 'mcq' | 'ox' | 'cloze' | 'short_answer' | 'flashcard'
    difficulty   : 'easy' | 'medium' | 'hard' | 'mixed'
    error_code   : null | 'insufficient_source' | 'count_exceeded' | 'capacity_reduced'
                   (mirrors the top-level `error` field of the prompt envelope)

    Soft-deleted (deleted_at not null) sets are treated as non-existent.
    """

    __tablename__ = "study_item_sets"

    file_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("files.id", ondelete="CASCADE"), nullable=False
    )
    item_type: Mapped[str] = mapped_column(String(20), nullable=False)
    difficulty: Mapped[str] = mapped_column(String(10), nullable=False)
    count_requested: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    language: Mapped[str] = mapped_column(String(10), nullable=False, default="auto")
    status: Mapped[ContentStatus] = mapped_column(
        Enum(ContentStatus, native_enum=False),
        default=ContentStatus.not_generated,
        nullable=False,
    )
    error_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    generated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    model_used: Mapped[str | None] = mapped_column(String(100), nullable=True)

    __table_args__ = (
        Index(
            "ix_study_item_sets_file_type_diff",
            "file_id",
            "item_type",
            "difficulty",
        ),
    )

    file = relationship("File")
    items = relationship(
        "StudyItem",
        back_populates="item_set",
        cascade="all, delete-orphan",
    )


class StudyItem(CommonMixin, Base):
    """A single /study item. Union-shaped by item_type.

    Populated fields per type (others null):
      mcq          : options[{label,text,correct,misconception_targeted}],
                     correct_answer(A|B|C|D), bloom_level, difficulty
      ox           : options[2], correct_answer(O|X), bloom_level, difficulty
      cloze        : correct_answer(str), acceptable_answers[str],
                     bloom_level, difficulty
      short_answer : correct_answer(str), key_points[str],
                     bloom_level, difficulty
      flashcard    : back(str) only (classification fields null)

    `difficulty` is per-item (allows mixed sets where each item has its own).
    """

    __tablename__ = "study_items"

    item_set_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("study_item_sets.id", ondelete="CASCADE"),
        nullable=False,
    )
    order: Mapped[int] = mapped_column(Integer, nullable=False)
    item_type: Mapped[str] = mapped_column(String(20), nullable=False)
    front: Mapped[str] = mapped_column(Text, nullable=False)
    back: Mapped[str | None] = mapped_column(Text, nullable=True)
    options: Mapped[list | None] = mapped_column(JSON, nullable=True)
    correct_answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    acceptable_answers: Mapped[list | None] = mapped_column(JSON, nullable=True)
    key_points: Mapped[list | None] = mapped_column(JSON, nullable=True)
    bloom_level: Mapped[str | None] = mapped_column(String(20), nullable=True)
    difficulty: Mapped[str | None] = mapped_column(String(10), nullable=True)
    source_span: Mapped[str | None] = mapped_column(Text, nullable=True)
    explanation: Mapped[str | None] = mapped_column(Text, nullable=True)

    item_set = relationship("StudyItemSet", back_populates="items")
