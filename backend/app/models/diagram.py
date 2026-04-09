from sqlalchemy import String, Text, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column

from app.database import CommonMixin, Base


class ConceptDiagram(CommonMixin, Base):
    __tablename__ = "concept_diagrams"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=False
    )
    concept_key: Mapped[str] = mapped_column(String(200), nullable=False)
    concept_label: Mapped[str] = mapped_column(String(200), nullable=False)
    diagram_type: Mapped[str] = mapped_column(String(50), nullable=False)
    mermaid_code: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)

    __table_args__ = (
        Index(
            "ix_concept_diagrams_user_concept", "user_id", "concept_key", unique=True
        ),
    )
