from datetime import datetime
from sqlalchemy import (
    String,
    Integer,
    BigInteger,
    Float,
    DateTime,
    ForeignKey,
    Index,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base, CommonMixin


class Subscription(CommonMixin, Base):
    __tablename__ = "subscriptions"

    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    tier: Mapped[str] = mapped_column(String(20), nullable=False)
    billing_cycle: Mapped[str] = mapped_column(
        String(20), nullable=False
    )  # monthly/quarterly
    stripe_subscription_id: Mapped[str | None] = mapped_column(
        String(100), nullable=True, unique=True
    )
    stripe_customer_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    paddle_subscription_id: Mapped[str | None] = mapped_column(
        String(100), nullable=True, unique=True
    )
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="active")
    current_period_end: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    reset_tz: Mapped[str] = mapped_column(String(50), default="Asia/Seoul")


class UsageRecord(CommonMixin, Base):
    __tablename__ = "usage_records"
    __table_args__ = (Index("ix_usage_user_resource", "user_id", "resource_type"),)

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    resource_type: Mapped[str] = mapped_column(
        String(30), nullable=False
    )  # quiz/ocr/storage
    window_start: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    window_end: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    consumed: Mapped[float] = mapped_column(Float, default=0)


class CreditBalance(CommonMixin, Base):
    __tablename__ = "credit_balances"

    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    storage_credits_bytes: Mapped[int] = mapped_column(BigInteger, default=0)
    ai_credits_count: Mapped[int] = mapped_column(Integer, default=0)


class CreditPurchase(CommonMixin, Base):
    __tablename__ = "credit_purchases"

    user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    credit_type: Mapped[str] = mapped_column(String(20), nullable=False)  # storage/ai
    amount: Mapped[int] = mapped_column(BigInteger, nullable=False)
    stripe_payment_intent_id: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )
    paddle_transaction_id: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )


class WebhookEvent(Base):
    """No CommonMixin — uses event_id as PK, no soft-delete."""

    __tablename__ = "webhook_events"

    event_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    processed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
