"""drop study_summaries unique constraint on file_id for version history

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f7
Create Date: 2026-04-26 12:00:00.000000
"""

from typing import Sequence, Union
from alembic import op

revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, None] = "a1b2c3d4e5f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop the unique constraint on file_id to allow multiple summary versions per file.
    # The constraint may not exist if the table was created via the migration
    # (which didn't include it) rather than create_all.
    op.execute(
        "ALTER TABLE study_summaries "
        "DROP CONSTRAINT IF EXISTS study_summaries_file_id_key"
    )


def downgrade() -> None:
    op.create_unique_constraint(
        "study_summaries_file_id_key", "study_summaries", ["file_id"]
    )
