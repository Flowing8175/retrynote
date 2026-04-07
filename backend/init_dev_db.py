"""One-time dev DB init: runs Alembic migrations and seeds a test user."""

import asyncio
import subprocess
import sys
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import select

DATABASE_URL = "postgresql+asyncpg://retrynote:retrynote@localhost:5432/retrynote"


def run_migrations() -> None:
    result = subprocess.run(
        ["python3", "-m", "alembic", "upgrade", "head"],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print("Migration failed:\n", result.stderr, file=sys.stderr)
        sys.exit(1)
    print(result.stdout.strip() or "Migrations up to date.")


async def seed_user() -> None:
    # Import here so models are registered after migrations run
    from app.models.user import User, UserRole
    from app.middleware.auth import hash_password

    engine = create_async_engine(DATABASE_URL, echo=False)
    session_factory = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )

    async with session_factory() as session:
        existing = await session.execute(select(User).where(User.username == "admin"))
        if existing.scalar_one_or_none():
            print("Test user already exists: admin / admin123")
        else:
            user = User(
                username="admin",
                email="admin@example.com",
                password_hash=hash_password("admin123"),
                role=UserRole.admin,
            )
            session.add(user)
            await session.commit()
            print("Test user created: admin / admin123")

    await engine.dispose()


if __name__ == "__main__":
    run_migrations()
    asyncio.run(seed_user())
