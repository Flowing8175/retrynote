"""add celery_task_id to jobs

Revision ID: 00619708a6f1
Revises: a1b2c3d4e5f6
Create Date: 2026-04-07 14:13:54.443144
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "00619708a6f1"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "jobs", sa.Column("celery_task_id", sa.String(length=255), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("jobs", "celery_task_id")
