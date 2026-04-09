"""diagram unique index per type

Revision ID: d1e2f3a4b5c6
Revises: 6108c9c0deb5
Create Date: 2026-04-09 00:00:00.000000
"""

from typing import Sequence, Union
from alembic import op


revision: str = "d1e2f3a4b5c6"
down_revision: Union[str, None] = "6108c9c0deb5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_index("ix_concept_diagrams_user_concept", table_name="concept_diagrams")
    op.create_index(
        "ix_concept_diagrams_user_concept_type",
        "concept_diagrams",
        ["user_id", "concept_key", "diagram_type"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_concept_diagrams_user_concept_type", table_name="concept_diagrams"
    )
    op.create_index(
        "ix_concept_diagrams_user_concept",
        "concept_diagrams",
        ["user_id", "concept_key"],
        unique=True,
    )
