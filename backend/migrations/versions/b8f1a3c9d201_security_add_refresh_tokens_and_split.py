"""security: add refresh_tokens table and password reset selector column

Revision ID: b8f1a3c9d201
Revises: a477dd4e7677
Create Date: 2026-04-02 22:00:00.000000
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "b8f1a3c9d201"
down_revision: Union[str, None] = "a477dd4e7677"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create refresh_tokens table for token revocation
    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.String(36), primary_key=True),  # JTI
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id"),
            nullable=False,
            index=True,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
    )

    # Add selector column to password_reset_tokens for split-token pattern
    op.add_column(
        "password_reset_tokens",
        sa.Column("selector", sa.String(22), nullable=True),
    )
    op.create_index(
        "ix_password_reset_tokens_selector",
        "password_reset_tokens",
        ["selector"],
    )

    # Remove unique constraint from token_hash (selector is now the lookup key)
    # The unique constraint name may vary, so we try common patterns
    try:
        op.drop_constraint(
            "password_reset_tokens_token_hash_key",
            "password_reset_tokens",
            type_="unique",
        )
    except Exception:
        pass  # constraint may not exist or have a different name

    # Backfill existing tokens with a random selector so column can be made NOT NULL
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(
            "UPDATE password_reset_tokens SET selector = LEFT(md5(random()::text), 16) WHERE selector IS NULL"
        )
    else:
        op.execute(
            "UPDATE password_reset_tokens SET selector = substr(hex(randomblob(8)), 1, 16) WHERE selector IS NULL"
        )
    with op.batch_alter_table("password_reset_tokens") as batch_op:
        batch_op.alter_column("selector", nullable=False)


def downgrade() -> None:
    with op.batch_alter_table("password_reset_tokens") as batch_op:
        batch_op.alter_column("selector", nullable=True)
    op.drop_index(
        "ix_password_reset_tokens_selector",
        table_name="password_reset_tokens",
    )
    op.drop_column("password_reset_tokens", "selector")
    op.drop_table("refresh_tokens")
