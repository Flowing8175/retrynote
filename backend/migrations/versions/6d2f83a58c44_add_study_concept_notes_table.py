"""add study_concept_notes table

Revision ID: 6d2f83a58c44
Revises: c71a92506682
Create Date: 2026-04-27 14:30:31.460867
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '6d2f83a58c44'
down_revision: Union[str, None] = 'c71a92506682'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'study_concept_notes',
        sa.Column('file_id', sa.String(length=36), nullable=False),
        sa.Column('data', sa.JSON(), nullable=True),
        sa.Column(
            'status',
            sa.Enum(
                'not_generated', 'generating', 'completed', 'failed',
                name='contentstatus', native_enum=False,
            ),
            nullable=False,
        ),
        sa.Column('generated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('model_used', sa.String(length=100), nullable=True),
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('version', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['file_id'], ['files.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('study_concept_notes')
