from datetime import datetime

import sqlalchemy as sa
from sqlalchemy import Boolean, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base, CommonMixin


class GuestSession(CommonMixin, Base):
    __tablename__ = "guest_sessions"

    session_token: Mapped[str] = mapped_column(
        String(255), unique=True, index=True, nullable=False
    )
    ip_address: Mapped[str] = mapped_column(String(45), nullable=False)
    turnstile_verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_activity_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP")
    )
    converted_user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=True
    )
    converted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
