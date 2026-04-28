"""extend admin_audit_logs with identity + request context

Revision ID: d8a17c4f5e92
Revises: e8d4f1a92b53
Create Date: 2026-04-28 00:00:00.000000
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "d8a17c4f5e92"
down_revision: Union[str, None] = "e8d4f1a92b53"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "admin_audit_logs",
        sa.Column("admin_email", sa.String(255), nullable=True),
    )
    op.add_column(
        "admin_audit_logs",
        sa.Column("admin_role", sa.String(20), nullable=True),
    )
    op.add_column(
        "admin_audit_logs",
        sa.Column("user_agent", sa.String(500), nullable=True),
    )
    op.add_column(
        "admin_audit_logs",
        sa.Column("request_method", sa.String(10), nullable=True),
    )
    op.add_column(
        "admin_audit_logs",
        sa.Column("request_path", sa.String(500), nullable=True),
    )
    op.add_column(
        "admin_audit_logs",
        sa.Column("request_id", sa.String(64), nullable=True),
    )
    op.add_column(
        "admin_audit_logs",
        sa.Column(
            "success",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.alter_column("admin_audit_logs", "success", server_default=None)

    op.create_index(
        "ix_admin_audit_logs_action_type",
        "admin_audit_logs",
        ["action_type"],
    )
    op.create_index(
        "ix_admin_audit_logs_created_at",
        "admin_audit_logs",
        ["created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_admin_audit_logs_created_at", table_name="admin_audit_logs")
    op.drop_index("ix_admin_audit_logs_action_type", table_name="admin_audit_logs")
    op.drop_column("admin_audit_logs", "success")
    op.drop_column("admin_audit_logs", "request_id")
    op.drop_column("admin_audit_logs", "request_path")
    op.drop_column("admin_audit_logs", "request_method")
    op.drop_column("admin_audit_logs", "user_agent")
    op.drop_column("admin_audit_logs", "admin_role")
    op.drop_column("admin_audit_logs", "admin_email")
