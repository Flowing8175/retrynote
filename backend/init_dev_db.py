"""One-time dev DB init: creates tables and a test user."""
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.database import Base
from app.models import *  # noqa: F401,F403 - register all models
from app.models.user import User, UserRole
from app.middleware.auth import hash_password

DATABASE_URL = "sqlite+aiosqlite:///./dev.db"


async def main():
    engine = create_async_engine(DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("Tables created.")

    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        user = User(
            username="admin",
            email="admin@example.com",
            password_hash=hash_password("admin123"),
            role=UserRole.admin,
            is_active=True,
        )
        session.add(user)
        await session.commit()
        print("Test user created: admin / admin123")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
