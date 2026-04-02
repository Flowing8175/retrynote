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


class ObjectionStatus(str, enum.Enum):
    submitted = "submitted"
    under_review = "under_review"
    upheld = "upheld"
    rejected = "rejected"
    partially_upheld = "partially_upheld"
    applied = "applied"


class Objection(CommonMixin, Base):
    __tablename__ = "objections"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=False
    )
    quiz_session_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("quiz_sessions.id"), nullable=False
    )
    quiz_item_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("quiz_items.id"), nullable=False
    )
    answer_log_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("answer_logs.id"), nullable=False
    )
    objection_reason: Mapped[str] = mapped_column(Text, nullable=False)
    objection_payload_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    status: Mapped[ObjectionStatus] = mapped_column(
        Enum(ObjectionStatus), default=ObjectionStatus.submitted, nullable=False
    )
    review_result_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    decided_by: Mapped[str | None] = mapped_column(String(20), nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    updated_by: Mapped[str | None] = mapped_column(String(36), nullable=True)


class WeakPoint(CommonMixin, Base):
    __tablename__ = "weak_points"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=False
    )
    concept_key: Mapped[str] = mapped_column(String(200), nullable=False)
    concept_label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    category_tag: Mapped[str | None] = mapped_column(String(100), nullable=True)
    wrong_count: Mapped[int] = mapped_column(Integer, default=0)
    partial_count: Mapped[int] = mapped_column(Integer, default=0)
    skip_count: Mapped[int] = mapped_column(Integer, default=0)
    last_wrong_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    streak_wrong_count: Mapped[int] = mapped_column(Integer, default=0)
    recommended_action: Mapped[str | None] = mapped_column(String(100), nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="active")
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    updated_by: Mapped[str | None] = mapped_column(String(36), nullable=True)

    __table_args__ = (
        Index("ix_weak_points_user_concept", "user_id", "concept_key", unique=True),
    )
