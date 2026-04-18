"""add user_instruction to quiz_sessions

Revision ID: c4f2e1a39d8b
Revises: a9c3d8e21f4b
Create Date: 2026-04-19 00:00:00.000000
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "c4f2e1a39d8b"
down_revision: Union[str, None] = "a9c3d8e21f4b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("quiz_sessions") as batch_op:
        batch_op.add_column(
            sa.Column("user_instruction", sa.Text(), nullable=True),
        )


def downgrade() -> None:
    with op.batch_alter_table("quiz_sessions") as batch_op:
        batch_op.drop_column("user_instruction")
