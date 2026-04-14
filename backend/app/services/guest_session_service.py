from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.guest import GuestSession


class GuestSessionService:
    @staticmethod
    async def create_guest_session(
        db: AsyncSession, session_token: str, ip_address: str
    ) -> GuestSession:
        session = GuestSession(
            session_token=session_token,
            ip_address=ip_address,
        )
        db.add(session)
        await db.flush()
        return session

    @staticmethod
    async def get_guest_session(
        db: AsyncSession, session_token: str
    ) -> GuestSession | None:
        result = await db.execute(
            select(GuestSession).where(
                GuestSession.session_token == session_token,
                GuestSession.is_deleted.is_(False),
            )
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def validate_guest_session(
        db: AsyncSession, session_token: str
    ) -> GuestSession:
        result = await db.execute(
            select(GuestSession).where(
                GuestSession.session_token == session_token,
                GuestSession.is_deleted.is_(False),
            )
        )
        session = result.scalar_one_or_none()

        if session is None:
            raise HTTPException(
                status_code=404, detail="게스트 세션을 찾을 수 없습니다."
            )

        ttl = timedelta(hours=24)
        if (
            datetime.now(timezone.utc)
            - session.last_activity_at.replace(tzinfo=timezone.utc)
            > ttl
        ):
            raise HTTPException(status_code=410, detail="게스트 세션이 만료되었습니다.")

        return session

    @staticmethod
    async def update_activity(db: AsyncSession, session_token: str) -> None:
        session = await GuestSessionService.get_guest_session(db, session_token)
        if session:
            session.last_activity_at = datetime.now(timezone.utc)
            await db.flush()

    @staticmethod
    async def mark_converted(
        db: AsyncSession, session_token: str, user_id: str
    ) -> None:
        session = await GuestSessionService.get_guest_session(db, session_token)
        if session:
            session.converted_user_id = user_id
            session.converted_at = datetime.now(timezone.utc)
            await db.flush()

    @staticmethod
    async def get_or_create(
        db: AsyncSession, session_token: str, ip_address: str
    ) -> GuestSession:
        existing = await GuestSessionService.get_guest_session(db, session_token)
        if existing:
            return existing
        return await GuestSessionService.create_guest_session(
            db, session_token, ip_address
        )

    @staticmethod
    async def cleanup_expired(db: AsyncSession, ttl_hours: int = 24) -> int:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=ttl_hours)
        result = await db.execute(
            update(GuestSession)
            .where(
                GuestSession.last_activity_at < cutoff,
                GuestSession.converted_user_id.is_(None),
                GuestSession.is_deleted.is_(False),
            )
            .values(is_deleted=True)
        )
        await db.flush()
        return result.rowcount  # type: ignore[attr-defined]
