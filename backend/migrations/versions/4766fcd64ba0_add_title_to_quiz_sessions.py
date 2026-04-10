"""add_title_to_quiz_sessions

Revision ID: 4766fcd64ba0
Revises: b7e592242d98
Create Date: 2026-04-10 22:12:23.195894
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '4766fcd64ba0'
down_revision: Union[str, None] = 'b7e592242d98'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('quiz_sessions', sa.Column('title', sa.String(length=200), nullable=True))


def downgrade() -> None:
    op.drop_column('quiz_sessions', 'title')
