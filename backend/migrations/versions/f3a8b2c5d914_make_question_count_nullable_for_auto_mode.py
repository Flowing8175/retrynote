"""make question_count nullable for auto mode

Revision ID: f3a8b2c5d914
Revises: c9a2f5e81b34
Create Date: 2026-04-03 00:00:00.000000
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "f3a8b2c5d914"
down_revision: Union[str, None] = "c9a2f5e81b34"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("quiz_sessions") as batch_op:
        batch_op.alter_column(
            "question_count",
            existing_type=sa.Integer(),
            nullable=True,
        )


def downgrade() -> None:
    # Restore non-nullable; fill NULLs with 0 first to avoid constraint violation
    op.execute(
        "UPDATE quiz_sessions SET question_count = 0 WHERE question_count IS NULL"
    )
    with op.batch_alter_table("quiz_sessions") as batch_op:
        batch_op.alter_column(
            "question_count",
            existing_type=sa.Integer(),
            nullable=False,
        )
