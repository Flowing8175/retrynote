from sqlalchemy import String, Text, Integer, ForeignKey, CheckConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base, CommonMixin


class SavedPrompt(CommonMixin, Base):
    __tablename__ = "saved_prompts"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    slot: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)

    __table_args__ = (
        CheckConstraint("slot >= 1 AND slot <= 3", name="ck_saved_prompts_slot_range"),
        Index("ux_saved_prompts_user_slot", "user_id", "slot", unique=True),
    )
