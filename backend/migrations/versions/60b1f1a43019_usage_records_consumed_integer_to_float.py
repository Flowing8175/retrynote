"""usage_records_consumed_integer_to_float

Revision ID: 60b1f1a43019
Revises: e2f3a4b5c6d7
Create Date: 2026-04-14 18:25:08.441969
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "60b1f1a43019"
down_revision: Union[str, None] = "e2f3a4b5c6d7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "usage_records",
        "consumed",
        existing_type=sa.Integer(),
        type_=sa.Float(),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "usage_records",
        "consumed",
        existing_type=sa.Float(),
        type_=sa.Integer(),
        existing_nullable=False,
    )
