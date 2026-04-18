"""add saved_prompts table

Revision ID: d2f4a1b6c8e9
Revises: c4f2e1a39d8b
Create Date: 2026-04-19 01:00:00.000000
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "d2f4a1b6c8e9"
down_revision: Union[str, None] = "c4f2e1a39d8b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "saved_prompts",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(length=36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("slot", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.CheckConstraint(
            "slot >= 1 AND slot <= 3", name="ck_saved_prompts_slot_range"
        ),
    )
    op.create_index(
        "ux_saved_prompts_user_slot",
        "saved_prompts",
        ["user_id", "slot"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ux_saved_prompts_user_slot", table_name="saved_prompts")
    op.drop_table("saved_prompts")
