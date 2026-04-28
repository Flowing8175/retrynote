"""add 'topic' value to filesourcetype enum

Revision ID: e8d4f1a92b53
Revises: 6d2f83a58c44
Create Date: 2026-04-28 00:00:00.000000

"""

from alembic import op


revision = "e8d4f1a92b53"
down_revision = "6d2f83a58c44"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        # ALTER TYPE ... ADD VALUE works inside a transaction since PG 12.
        # IF NOT EXISTS makes the migration idempotent across re-runs.
        # SQLite stores enums as VARCHAR so no schema change is needed there.
        op.execute("ALTER TYPE filesourcetype ADD VALUE IF NOT EXISTS 'topic'")


def downgrade() -> None:
    # PostgreSQL has no in-place way to drop a single enum value; would require
    # recreating filesourcetype and rewriting every dependent row. No-op.
    pass
