"""add_guest_sessions_and_guest_columns

Revision ID: b7e592242d98
Revises: d1e2f3a4b5c6
Create Date: 2026-04-09 14:11:29.769461
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "b7e592242d98"
down_revision: Union[str, None] = "d1e2f3a4b5c6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create guest_sessions table
    op.create_table(
        "guest_sessions",
        sa.Column("session_token", sa.String(length=255), nullable=False),
        sa.Column("ip_address", sa.String(length=45), nullable=False),
        sa.Column("turnstile_verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "last_activity_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column("converted_user_id", sa.String(length=36), nullable=True),
        sa.Column("converted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.ForeignKeyConstraint(["converted_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_guest_sessions_session_token"),
        "guest_sessions",
        ["session_token"],
        unique=True,
    )
    op.create_index(
        "ix_guest_sessions_created_at",
        "guest_sessions",
        ["created_at"],
    )

    # 2. Add guest_session_id to quiz_sessions + make user_id nullable
    op.add_column(
        "quiz_sessions",
        sa.Column("guest_session_id", sa.String(length=36), nullable=True),
    )
    op.alter_column(
        "quiz_sessions",
        "user_id",
        existing_type=sa.VARCHAR(length=36),
        nullable=True,
    )
    op.create_foreign_key(
        "fk_quiz_sessions_guest_session",
        "quiz_sessions",
        "guest_sessions",
        ["guest_session_id"],
        ["id"],
    )
    op.create_index(
        "ix_quiz_sessions_guest_session_id",
        "quiz_sessions",
        ["guest_session_id"],
    )
    op.create_check_constraint(
        "ck_quiz_sessions_owner",
        "quiz_sessions",
        "user_id IS NOT NULL OR guest_session_id IS NOT NULL",
    )

    # 3. Add guest_session_id to answer_logs + make user_id nullable
    op.add_column(
        "answer_logs",
        sa.Column("guest_session_id", sa.String(length=36), nullable=True),
    )
    op.alter_column(
        "answer_logs",
        "user_id",
        existing_type=sa.VARCHAR(length=36),
        nullable=True,
    )
    op.create_foreign_key(
        "fk_answer_logs_guest_session",
        "answer_logs",
        "guest_sessions",
        ["guest_session_id"],
        ["id"],
    )
    op.create_index(
        "ix_answer_logs_guest_session_id",
        "answer_logs",
        ["guest_session_id"],
    )
    op.create_check_constraint(
        "ck_answer_logs_owner",
        "answer_logs",
        "user_id IS NOT NULL OR guest_session_id IS NOT NULL",
    )
    # Partial index for guest answer queries
    op.execute(
        "CREATE INDEX ix_answer_logs_guest_active ON answer_logs"
        "(guest_session_id, is_active_result) WHERE guest_session_id IS NOT NULL"
    )

    # 4. Add guest_session_id to files + make user_id nullable
    op.add_column(
        "files",
        sa.Column("guest_session_id", sa.String(length=36), nullable=True),
    )
    op.alter_column(
        "files",
        "user_id",
        existing_type=sa.VARCHAR(length=36),
        nullable=True,
    )
    op.create_foreign_key(
        "fk_files_guest_session",
        "files",
        "guest_sessions",
        ["guest_session_id"],
        ["id"],
    )
    op.create_index(
        "ix_files_guest_session_id",
        "files",
        ["guest_session_id"],
    )
    op.create_check_constraint(
        "ck_files_owner",
        "files",
        "user_id IS NOT NULL OR guest_session_id IS NOT NULL",
    )


def downgrade() -> None:
    # files
    op.drop_constraint("ck_files_owner", "files", type_="check")
    op.drop_index("ix_files_guest_session_id", table_name="files")
    op.drop_constraint("fk_files_guest_session", "files", type_="foreignkey")
    op.alter_column(
        "files",
        "user_id",
        existing_type=sa.VARCHAR(length=36),
        nullable=False,
    )
    op.drop_column("files", "guest_session_id")

    # answer_logs
    op.execute("DROP INDEX IF EXISTS ix_answer_logs_guest_active")
    op.drop_constraint("ck_answer_logs_owner", "answer_logs", type_="check")
    op.drop_index("ix_answer_logs_guest_session_id", table_name="answer_logs")
    op.drop_constraint(
        "fk_answer_logs_guest_session", "answer_logs", type_="foreignkey"
    )
    op.alter_column(
        "answer_logs",
        "user_id",
        existing_type=sa.VARCHAR(length=36),
        nullable=False,
    )
    op.drop_column("answer_logs", "guest_session_id")

    # quiz_sessions
    op.drop_constraint("ck_quiz_sessions_owner", "quiz_sessions", type_="check")
    op.drop_index("ix_quiz_sessions_guest_session_id", table_name="quiz_sessions")
    op.drop_constraint(
        "fk_quiz_sessions_guest_session", "quiz_sessions", type_="foreignkey"
    )
    op.alter_column(
        "quiz_sessions",
        "user_id",
        existing_type=sa.VARCHAR(length=36),
        nullable=False,
    )
    op.drop_column("quiz_sessions", "guest_session_id")

    # guest_sessions table
    op.drop_index("ix_guest_sessions_created_at", table_name="guest_sessions")
    op.drop_index(op.f("ix_guest_sessions_session_token"), table_name="guest_sessions")
    op.drop_table("guest_sessions")
