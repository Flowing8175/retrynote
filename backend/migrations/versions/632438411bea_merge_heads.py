"""merge heads

Revision ID: 632438411bea
Revises: 7a9c4d2e1b8f, b2c3d4e5f6a7
Create Date: 2026-04-26 18:50:41.937269
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '632438411bea'
down_revision: Union[str, None] = ('7a9c4d2e1b8f', 'b2c3d4e5f6a7')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
