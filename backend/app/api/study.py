import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.file import File, FileStatus
from app.models.study import (
    ContentStatus,
    StudyFlashcard,
    StudyFlashcardSet,
    StudyMindmap,
    StudySummary,
)
from app.models.user import User
from app.schemas.study import (
    GenerateRequest,
    StudyChatHistoryResponse,
    StudyChatMessageResponse,
    StudyFlashcardResponse,
    StudyFlashcardSetResponse,
    StudyMindmapResponse,
    StudyStatusResponse,
    StudySummaryResponse,
)
from app.services.tutor_service import (
    create_new_chat,
    get_chat_history,
    get_chat_sessions,
    stream_tutor_response,
)
from app.utils.sse import get_current_user_from_query_token, sse_stream
from app.workers.celery_app import dispatch_task

router = APIRouter()
logger = logging.getLogger(__name__)


async def _get_owned_file(file_id: str, db: AsyncSession, user: User) -> File:
    result = await db.execute(
        select(File).where(File.id == file_id, File.deleted_at.is_(None))
    )
    file = result.scalar_one_or_none()
    if file is None:
        raise HTTPException(status_code=404, detail="File not found")
    if file.user_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    return file


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


@router.get("/{file_id}/status", response_model=StudyStatusResponse)
async def get_study_status(
    file_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _get_owned_file(file_id, db, user)

    summary_result = await db.execute(
        select(StudySummary).where(StudySummary.file_id == file_id)
    )
    summary = summary_result.scalar_one_or_none()

    flashcard_result = await db.execute(
        select(StudyFlashcardSet).where(
            StudyFlashcardSet.file_id == file_id,
            StudyFlashcardSet.deleted_at.is_(None),
        )
    )
    flashcard_set = flashcard_result.scalar_one_or_none()

    mindmap_result = await db.execute(
        select(StudyMindmap).where(
            StudyMindmap.file_id == file_id,
            StudyMindmap.deleted_at.is_(None),
        )
    )
    mindmap = mindmap_result.scalar_one_or_none()

    return StudyStatusResponse(
        file_id=file_id,
        summary_status=(
            summary.status.value if summary else ContentStatus.not_generated.value
        ),
        flashcards_status=(
            flashcard_set.status.value
            if flashcard_set
            else ContentStatus.not_generated.value
        ),
        mindmap_status=(
            mindmap.status.value if mindmap else ContentStatus.not_generated.value
        ),
    )


@router.get("/{file_id}/summary", response_model=StudySummaryResponse)
async def get_summary(
    file_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _get_owned_file(file_id, db, user)

    result = await db.execute(
        select(StudySummary).where(StudySummary.file_id == file_id)
    )
    summary = result.scalar_one_or_none()

    if (
        summary is None
        or summary.status != ContentStatus.completed
        or summary.content is None
    ):
        status = summary.status.value if summary else ContentStatus.not_generated.value
        raise HTTPException(
            status_code=404,
            detail=f"Summary not available. Status: {status}",
        )

    return StudySummaryResponse.model_validate(summary)


@router.post("/{file_id}/summary/generate")
async def generate_summary_endpoint(
    file_id: str,
    req: GenerateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    file = await _get_owned_file(file_id, db, user)

    if file.status != FileStatus.ready:
        raise HTTPException(
            status_code=400,
            detail="File is not ready for study material generation",
        )

    result = await db.execute(
        select(StudySummary).where(StudySummary.file_id == file_id)
    )
    summary = result.scalar_one_or_none()

    if summary and summary.status == ContentStatus.generating:
        raise HTTPException(
            status_code=409, detail="Summary generation already in progress"
        )

    dispatch_task("generate_study_summary", [file_id])
    return {"status": "dispatched"}


@router.get("/{file_id}/flashcards", response_model=StudyFlashcardSetResponse)
async def get_flashcards(
    file_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _get_owned_file(file_id, db, user)

    result = await db.execute(
        select(StudyFlashcardSet).where(
            StudyFlashcardSet.file_id == file_id,
            StudyFlashcardSet.deleted_at.is_(None),
        )
    )
    flashcard_set = result.scalar_one_or_none()

    if flashcard_set is None or flashcard_set.status != ContentStatus.completed:
        status = (
            flashcard_set.status.value
            if flashcard_set
            else ContentStatus.not_generated.value
        )
        raise HTTPException(
            status_code=404,
            detail=f"Flashcards not available. Status: {status}",
        )

    cards_result = await db.execute(
        select(StudyFlashcard)
        .where(StudyFlashcard.flashcard_set_id == flashcard_set.id)
        .order_by(StudyFlashcard.order)
    )
    flashcards = cards_result.scalars().all()

    return StudyFlashcardSetResponse(
        id=flashcard_set.id,
        file_id=flashcard_set.file_id,
        status=flashcard_set.status.value,
        cards=[StudyFlashcardResponse.model_validate(card) for card in flashcards],
        generated_at=flashcard_set.generated_at,
    )


@router.post("/{file_id}/flashcards/generate")
async def generate_flashcards_endpoint(
    file_id: str,
    req: GenerateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    file = await _get_owned_file(file_id, db, user)

    if file.status != FileStatus.ready:
        raise HTTPException(
            status_code=400,
            detail="File is not ready for study material generation",
        )

    result = await db.execute(
        select(StudyFlashcardSet).where(
            StudyFlashcardSet.file_id == file_id,
            StudyFlashcardSet.deleted_at.is_(None),
        )
    )
    flashcard_set = result.scalar_one_or_none()

    if flashcard_set and flashcard_set.status == ContentStatus.generating:
        raise HTTPException(
            status_code=409, detail="Flashcard generation already in progress"
        )

    if req.force_regenerate and flashcard_set:
        flashcard_set.deleted_at = datetime.now(timezone.utc)
        await db.commit()

    dispatch_task("generate_study_flashcards", [file_id])
    return {"status": "dispatched"}


@router.get("/{file_id}/mindmap", response_model=StudyMindmapResponse)
async def get_mindmap(
    file_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _get_owned_file(file_id, db, user)

    result = await db.execute(
        select(StudyMindmap).where(
            StudyMindmap.file_id == file_id,
            StudyMindmap.deleted_at.is_(None),
        )
    )
    mindmap = result.scalar_one_or_none()

    if (
        mindmap is None
        or mindmap.status != ContentStatus.completed
        or mindmap.data is None
    ):
        status = mindmap.status.value if mindmap else ContentStatus.not_generated.value
        raise HTTPException(
            status_code=404,
            detail=f"Mindmap not available. Status: {status}",
        )

    return StudyMindmapResponse.model_validate(mindmap)


@router.post("/{file_id}/mindmap/generate")
async def generate_mindmap_endpoint(
    file_id: str,
    req: GenerateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    file = await _get_owned_file(file_id, db, user)

    if file.status != FileStatus.ready:
        raise HTTPException(
            status_code=400,
            detail="File is not ready for study material generation",
        )

    result = await db.execute(
        select(StudyMindmap).where(
            StudyMindmap.file_id == file_id,
            StudyMindmap.deleted_at.is_(None),
        )
    )
    mindmap = result.scalar_one_or_none()

    if mindmap and mindmap.status == ContentStatus.generating:
        raise HTTPException(
            status_code=409, detail="Mindmap generation already in progress"
        )

    if req.force_regenerate and mindmap:
        mindmap.deleted_at = datetime.now(timezone.utc)
        await db.commit()

    dispatch_task("generate_study_mindmap", [file_id])
    return {"status": "dispatched"}


@router.get("/{file_id}/chat/history", response_model=StudyChatHistoryResponse)
async def get_chat_history_endpoint(
    file_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _get_owned_file(file_id, db, user)

    messages = await get_chat_history(file_id, db)
    await db.commit()

    return StudyChatHistoryResponse(
        messages=[
            StudyChatMessageResponse(
                role=msg.role.value,
                content=msg.content,
                page_context=msg.page_context,
                created_at=msg.created_at,
            )
            for msg in messages
        ]
    )


@router.post("/{file_id}/chat/new")
async def create_new_chat_endpoint(
    file_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _get_owned_file(file_id, db, user)

    chat = await create_new_chat(file_id, db)
    await db.commit()
    await db.refresh(chat)

    return {"chat_id": chat.id, "created_at": chat.created_at}


@router.get("/{file_id}/chat/sessions")
async def list_chat_sessions(
    file_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _get_owned_file(file_id, db, user)

    sessions = await get_chat_sessions(file_id, db)

    return [
        {"chat_id": session.id, "created_at": session.created_at}
        for session in sessions
    ]
