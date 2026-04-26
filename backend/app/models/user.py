import enum
from datetime import datetime
import sqlalchemy as sa
from sqlalchemy import (
    String,
    Text,
    Integer,
    Boolean,
    DateTime,
    Enum,
    BigInteger,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base, CommonMixin
import uuid


class UserRole(str, enum.Enum):
    user = "user"
    admin = "admin"
    super_admin = "super_admin"


class User(CommonMixin, Base):
    __tablename__ = "users"

    username: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole), default=UserRole.user, nullable=False
    )
    storage_used_bytes: Mapped[int] = mapped_column(BigInteger, default=0)
    storage_quota_bytes: Mapped[int] = mapped_column(
        BigInteger, default=52428800
    )  # 50MB (Free tier default)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_login_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    status: Mapped[str] = mapped_column(String(50), default="active")
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    updated_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    tier: Mapped[str] = mapped_column(String(20), default="free", nullable=False)
    stripe_customer_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    paddle_customer_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    email_verified: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=sa.false()
    )
    signup_ip: Mapped[str | None] = mapped_column(String(45), nullable=True)

    folders = relationship("Folder", back_populates="user", lazy="selectin")
    files = relationship("File", back_populates="user", lazy="selectin")


class AdminSettings(Base):
    __tablename__ = "admin_settings"

    id: Mapped[str] = mapped_column(primary_key=True, default=lambda: str(uuid.uuid4()))
    active_generation_model: Mapped[str] = mapped_column(String(100), default="gpt-4o")
    fallback_generation_model: Mapped[str] = mapped_column(
        String(100), default="gpt-4o-mini"
    )
    max_upload_total_mb: Mapped[int] = mapped_column(Integer, default=100)
    daily_quiz_generation_limit: Mapped[int] = mapped_column(Integer, default=50)
    daily_ocr_page_limit: Mapped[int] = mapped_column(Integer, default=100)
    banner_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    banner_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    master_password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP")
    )
    updated_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
