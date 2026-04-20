"""add study_item_sets and study_items tables

Revision ID: a1b2c3d4e5f7
Revises: d2f4a1b6c8e9
Create Date: 2026-04-20 12:00:00.000000
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "a1b2c3d4e5f7"
down_revision: Union[str, None] = "d2f4a1b6c8e9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "study_item_sets",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "file_id",
            sa.String(length=36),
            sa.ForeignKey("files.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("item_type", sa.String(length=20), nullable=False),
        sa.Column("difficulty", sa.String(length=10), nullable=False),
        sa.Column(
            "count_requested",
            sa.Integer(),
            nullable=False,
            server_default="5",
        ),
        sa.Column(
            "language",
            sa.String(length=10),
            nullable=False,
            server_default="auto",
        ),
        sa.Column(
            "status",
            sa.Enum(
                "not_generated",
                "generating",
                "completed",
                "failed",
                name="contentstatus",
                native_enum=False,
            ),
            nullable=False,
        ),
        sa.Column("error_code", sa.String(length=50), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("model_used", sa.String(length=100), nullable=True),
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
    )
    op.create_index(
        "ix_study_item_sets_file_type_diff",
        "study_item_sets",
        ["file_id", "item_type", "difficulty"],
    )

    op.create_table(
        "study_items",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "item_set_id",
            sa.String(length=36),
            sa.ForeignKey("study_item_sets.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("order", sa.Integer(), nullable=False),
        sa.Column("item_type", sa.String(length=20), nullable=False),
        sa.Column("front", sa.Text(), nullable=False),
        sa.Column("back", sa.Text(), nullable=True),
        sa.Column("options", sa.JSON(), nullable=True),
        sa.Column("correct_answer", sa.Text(), nullable=True),
        sa.Column("acceptable_answers", sa.JSON(), nullable=True),
        sa.Column("key_points", sa.JSON(), nullable=True),
        sa.Column("bloom_level", sa.String(length=20), nullable=True),
        sa.Column("difficulty", sa.String(length=10), nullable=True),
        sa.Column("source_span", sa.Text(), nullable=True),
        sa.Column("explanation", sa.Text(), nullable=True),
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
    )


def downgrade() -> None:
    op.drop_table("study_items")
    op.drop_index(
        "ix_study_item_sets_file_type_diff", table_name="study_item_sets"
    )
    op.drop_table("study_item_sets")
