"""add expires_at to impersonation_sessions

Revision ID: a1b2c3d4e5f6
Revises: d5e6f7a8b9c0
Create Date: 2026-04-07 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa

revision = "a1b2c3d4e5f6"
down_revision = "c1a2b3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "impersonation_sessions",
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("impersonation_sessions", "expires_at")
