import asyncio
import logging

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.file import File
from app.models.quiz import AnswerLog, QuizSession

logger = logging.getLogger(__name__)


class GuestConversionService:
    @staticmethod
    async def convert_guest_to_user(
        db: AsyncSession, guest_session_id: str, user_id: str
    ) -> None:
        await db.execute(
            update(QuizSession)
            .where(QuizSession.guest_session_id == guest_session_id)
            .values(user_id=user_id)
        )

        await db.execute(
            update(AnswerLog)
            .where(AnswerLog.guest_session_id == guest_session_id)
            .values(user_id=user_id)
        )

        await db.execute(
            update(File)
            .where(File.guest_session_id == guest_session_id)
            .values(user_id=user_id)
        )

        await db.flush()

    @staticmethod
    async def move_guest_files(
        db: AsyncSession, guest_session_id: str, user_id: str
    ) -> None:
        from app.services import storage as _storage

        result = await db.execute(
            select(File).where(
                File.guest_session_id == guest_session_id,
                File.stored_path.isnot(None),
            )
        )
        files = result.scalars().all()

        sem = asyncio.Semaphore(5)

        async def _move_one(f: File) -> None:
            if not f.stored_path or not f.stored_path.startswith("guest/"):
                return
            async with sem:
                try:
                    old_path = f.stored_path
                    filename = old_path.split("/")[-1]
                    new_path = f"{user_id}/{filename}"
                    data = await _storage.download_file(old_path)
                    await _storage.upload_file(new_path, data)
                    await _storage.delete_file(old_path)
                    f.stored_path = new_path
                except Exception:
                    logger.warning(
                        "Failed to move file %s to %s", f.stored_path, user_id
                    )

        await asyncio.gather(*[_move_one(f) for f in files])

        await db.flush()
