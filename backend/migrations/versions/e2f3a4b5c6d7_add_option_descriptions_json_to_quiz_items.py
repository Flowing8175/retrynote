"""add option_descriptions_json to quiz_items

Revision ID: e2f3a4b5c6d7
Revises: 4766fcd64ba0
Create Date: 2026-04-12 23:30:00.000000
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "e2f3a4b5c6d7"
down_revision: Union[str, None] = "4766fcd64ba0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "quiz_items",
        sa.Column("option_descriptions_json", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("quiz_items", "option_descriptions_json")
