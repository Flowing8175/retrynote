"""add canceled_at to subscriptions

Revision ID: c71a92506682
Revises: 632438411bea
Create Date: 2026-04-26 18:50:57.447486
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'c71a92506682'
down_revision: Union[str, None] = '632438411bea'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('subscriptions', sa.Column('canceled_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('subscriptions', 'canceled_at')
