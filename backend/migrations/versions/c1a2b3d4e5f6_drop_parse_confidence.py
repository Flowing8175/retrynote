"""drop_parse_confidence

Revision ID: c1a2b3d4e5f6
Revises: d5e6f7a8b9c0
Create Date: 2026-04-06 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa

revision = "c1a2b3d4e5f6"
down_revision = "d5e6f7a8b9c0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("parsed_documents", "parse_confidence")


def downgrade() -> None:
    op.add_column(
        "parsed_documents",
        sa.Column("parse_confidence", sa.Float(), nullable=True),
    )
