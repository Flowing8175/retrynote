import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.file import File
from app.models.user import User
from app.services import storage as _storage

logger = logging.getLogger(__name__)


async def hard_delete_user(db: AsyncSession, user: User) -> None:
    stored_paths = (
        (
            await db.execute(
                select(File.stored_path).where(
                    File.user_id == user.id, File.stored_path.is_not(None)
                )
            )
        )
        .scalars()
        .all()
    )

    for path in stored_paths:
        if not path:
            continue
        try:
            await _storage.delete_file(path)
        except Exception as exc:
            logger.warning(
                "hard_delete_user: storage delete failed for user=%s path=%s: %s",
                user.id,
                path,
                exc,
            )

    await db.delete(user)
