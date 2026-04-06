"""add_paddle_columns

Revision ID: d5e6f7a8b9c0
Revises: 46a0893e885f
Create Date: 2026-04-06 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa

revision = "d5e6f7a8b9c0"
down_revision = "46a0893e885f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users", sa.Column("paddle_customer_id", sa.String(100), nullable=True)
    )
    op.add_column(
        "subscriptions",
        sa.Column("paddle_subscription_id", sa.String(100), nullable=True),
    )
    op.create_index(
        "ix_subscriptions_paddle_subscription_id",
        "subscriptions",
        ["paddle_subscription_id"],
        unique=True,
    )
    op.add_column(
        "credit_purchases",
        sa.Column("paddle_transaction_id", sa.String(100), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("credit_purchases", "paddle_transaction_id")
    op.drop_index("ix_subscriptions_paddle_subscription_id", table_name="subscriptions")
    op.drop_column("subscriptions", "paddle_subscription_id")
    op.drop_column("users", "paddle_customer_id")
