import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.file import File
from app.models.user import User
from app.services.tutor_service import stream_tutor_response
from app.utils.sse import get_current_user_from_query_token, sse_stream

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/{file_id}/chat/stream")
async def chat_stream(
    file_id: str,
    message: str = Query(...),
    page_context: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_from_query_token),
):
    result = await db.execute(
        select(File).where(File.id == file_id, File.deleted_at.is_(None))
    )
    file = result.scalar_one_or_none()
    if file is None:
        raise HTTPException(status_code=404, detail="File not found")
    if file.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    return sse_stream(
        stream_tutor_response(
            file_id=file_id,
            message=message,
            page_context=page_context,
            db=db,
        )
    )
