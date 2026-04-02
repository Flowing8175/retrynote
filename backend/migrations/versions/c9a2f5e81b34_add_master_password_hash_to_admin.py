"""add master_password_hash to admin_settings

Revision ID: c9a2f5e81b34
Revises: b8f1a3c9d201
Create Date: 2026-04-02 23:00:00.000000
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "c9a2f5e81b34"
down_revision: Union[str, None] = "b8f1a3c9d201"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "admin_settings",
        sa.Column("master_password_hash", sa.String(255), nullable=True),
    )
    # Migrate: if updated_by contains a bcrypt hash (starts with '$2b$'),
    # move it to master_password_hash and clear updated_by.
    op.execute(
        """
        UPDATE admin_settings
        SET master_password_hash = updated_by,
            updated_by = NULL
        WHERE updated_by LIKE '$2b$%%'
        """
    )


def downgrade() -> None:
    # Move master_password_hash back to updated_by before dropping the column
    op.execute(
        """
        UPDATE admin_settings
        SET updated_by = master_password_hash
        WHERE master_password_hash IS NOT NULL
          AND updated_by IS NULL
        """
    )
    op.drop_column("admin_settings", "master_password_hash")
