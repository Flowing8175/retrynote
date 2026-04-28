import re
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.guest import GuestSession

# Guest tokens are minted client-side via crypto.randomUUID() (UUIDv4).
# Strict format validation rejects garbage / probe-style tokens before they
# reach the DB and lets legitimate tokens through unchanged. This is NOT a
# replacement for proper server-minted signed tokens — see the security
# audit notes — but it raises the bar for trivial enumeration / fuzzing.
_UUID_V4_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.IGNORECASE,
)

INACTIVITY_TTL = timedelta(hours=24)
ABSOLUTE_LIFETIME = timedelta(days=30)


def _validate_token_format(session_token: str) -> None:
    if not session_token or not _UUID_V4_RE.match(session_token):
        raise HTTPException(status_code=400, detail="Invalid guest session token.")


class GuestSessionService:
    @staticmethod
    async def create_guest_session(
        db: AsyncSession, session_token: str, ip_address: str
    ) -> GuestSession:
        _validate_token_format(session_token)
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
        if not session_token or not _UUID_V4_RE.match(session_token):
            return None
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
        _validate_token_format(session_token)
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

        # Two expiry conditions: idle timeout (last activity) AND absolute
        # lifetime from creation. Without an absolute cap, a leaked token
        # could be kept alive forever by periodic activity, turning a
        # one-time leak into permanent guest-account access.
        now = datetime.now(timezone.utc)
        last_activity = session.last_activity_at.replace(tzinfo=timezone.utc)
        created_at = session.created_at.replace(tzinfo=timezone.utc)
        if (now - last_activity) > INACTIVITY_TTL:
            raise HTTPException(status_code=410, detail="게스트 세션이 만료되었습니다.")
        if (now - created_at) > ABSOLUTE_LIFETIME:
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
