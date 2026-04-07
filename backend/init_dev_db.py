"""One-time dev DB init: creates tables and a test user."""

import asyncio
from datetime import datetime, timezone
from uuid import uuid4
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import text
from app.database import Base
from app.models import *  # noqa: F401,F403 - register all models
from app.models.user import UserRole
from app.middleware.auth import hash_password

DATABASE_URL = "sqlite+aiosqlite:///./dev.db"


async def main():
    engine = create_async_engine(DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("Tables created.")

    session_factory = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )
    async with session_factory() as session:
        now = datetime.now(timezone.utc).isoformat()
        user_id = str(uuid4())

        # Insert directly with SQL to avoid func.now() issue in SQLite
        await session.execute(
            text("""
                INSERT INTO users 
                (id, username, email, password_hash, role, is_active, storage_used_bytes, 
                 storage_quota_bytes, tier, status, created_at, updated_at, version)
                VALUES (:id, :username, :email, :password_hash, :role, :is_active, 
                        :storage_used_bytes, :storage_quota_bytes, :tier, :status, 
                        :created_at, :updated_at, :version)
            """),
            {
                "id": user_id,
                "username": "admin",
                "email": "admin@example.com",
                "password_hash": hash_password("admin123"),
                "role": UserRole.admin,
                "is_active": True,
                "storage_used_bytes": 0,
                "storage_quota_bytes": 104857600,
                "tier": "free",
                "status": "active",
                "created_at": now,
                "updated_at": now,
                "version": 1,
            },
        )
        await session.commit()
        print("Test user created: admin / admin123")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
