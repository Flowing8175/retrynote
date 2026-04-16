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
    __table_args__ = (UniqueConstraint("file_id"),)

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
