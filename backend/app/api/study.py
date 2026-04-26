import logging
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.file import File, FileStatus
from app.models.study import (
    ContentStatus,
    StudyFlashcard,
    StudyFlashcardSet,
    StudyItem,
    StudyItemSet,
    StudyMindmap,
    StudySummary,
    StudyVisit,
)
from app.models.user import User
from app.schemas.billing import LimitExceededError
from app.schemas.study import (
    ContentVersionItem,
    ContentVersionsResponse,
    GenerateRequest,
    MindmapNodeExplanationRequest,
    MindmapNodeExplanationResponse,
    StudyChatHistoryResponse,
    StudyChatMessageResponse,
    StudyDifficulty,
    StudyFlashcardResponse,
    StudyFlashcardSetResponse,
    StudyHistoryItem,
    StudyHistoryResponse,
    StudyItemGenerateRequest,
    StudyItemResponse,
    StudyItemSetResponse,
    StudyItemType,
    StudyMindmapResponse,
    StudyStatusResponse,
    StudySummaryResponse,
    StudyVisitResponse,
)
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.services.study_service import (
    MindmapNotReadyError,
    NodeNotFoundError,
    generate_node_explanation,
)
from app.services.tutor_service import (
    create_new_chat,
    get_chat_history,
    get_chat_sessions,
    stream_tutor_response,
)
from app.services.usage_service import UsageService
from app.tier_config import STUDY_CREDIT_ESTIMATE, TIER_LIMITS, UserTier
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


@router.get("/history", response_model=StudyHistoryResponse)
async def get_study_history(
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(
            File.id.label("file_id"),
            File.original_filename,
            File.file_type,
            File.file_size_bytes,
            File.source_type,
            File.status,
            File.folder_id,
            StudyVisit.last_visited_at,
            StudyVisit.visit_count,
        )
        .join(StudyVisit, StudyVisit.file_id == File.id)
        .where(
            StudyVisit.user_id == user.id,
            File.user_id == user.id,
            File.deleted_at.is_(None),
        )
        .order_by(StudyVisit.last_visited_at.desc())
        .limit(limit)
    )
    rows = result.all()
    items = [
        StudyHistoryItem(
            file_id=row.file_id,
            original_filename=row.original_filename,
            file_type=row.file_type,
            file_size_bytes=row.file_size_bytes,
            source_type=row.source_type.value if hasattr(row.source_type, "value") else row.source_type,
            status=row.status.value if hasattr(row.status, "value") else row.status,
            folder_id=row.folder_id,
            last_visited_at=row.last_visited_at,
            visit_count=row.visit_count,
        )
        for row in rows
    ]
    return StudyHistoryResponse(items=items, total=len(items))


@router.post("/{file_id}/visit", response_model=StudyVisitResponse)
async def record_study_visit(
    file_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _get_owned_file(file_id, db, user)

    now = datetime.now(timezone.utc)
    stmt = (
        pg_insert(StudyVisit)
        .values(
            user_id=user.id,
            file_id=file_id,
            last_visited_at=now,
            visit_count=1,
        )
        .on_conflict_do_update(
            index_elements=["user_id", "file_id"],
            set_={
                "last_visited_at": now,
                "visit_count": StudyVisit.__table__.c.visit_count + 1,
                "updated_at": now,
            },
        )
        .returning(StudyVisit.last_visited_at, StudyVisit.visit_count)
    )
    result = await db.execute(stmt)
    row = result.one()
    await db.commit()
    return StudyVisitResponse(
        status="ok",
        last_visited_at=row.last_visited_at,
        visit_count=row.visit_count,
    )


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

    usage_svc = UsageService()
    tier = UserTier(current_user.tier)
    allowed, _, _ = await usage_svc.check_and_consume(
        db, current_user, "quiz", STUDY_CREDIT_ESTIMATE
    )
    if not allowed:
        raise HTTPException(
            status_code=402,
            detail=LimitExceededError(
                detail="학습 AI 사용 한도를 초과했습니다. 요금제를 업그레이드하거나 크레딧을 구매하세요.",
                limit_type="quiz",
                current_usage=TIER_LIMITS[tier].quiz_per_window,
                limit=TIER_LIMITS[tier].quiz_per_window,
            ).model_dump(),
        )
    await db.commit()

    return sse_stream(
        stream_tutor_response(
            file_id=file_id,
            message=message,
            page_context=page_context,
            db=db,
            user_id=current_user.id,
            credit_estimate=STUDY_CREDIT_ESTIMATE,
        )
    )


@router.get("/{file_id}/status", response_model=StudyStatusResponse)
async def get_study_status(
    file_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    file = await _get_owned_file(file_id, db, user)

    summary_result = await db.execute(
        select(StudySummary).where(
            StudySummary.file_id == file_id,
            StudySummary.deleted_at.is_(None),
        )
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

    parsed_doc = file.parsed_document
    text = (parsed_doc.normalized_text or "") if parsed_doc else ""
    is_short = file.status == FileStatus.ready and len(text) < 100

    return StudyStatusResponse(
        file_id=file_id,
        filename=file.original_filename,
        file_type=file.file_type,
        file_status=file.status.value if file.status else None,
        is_short_document=is_short,
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
    version_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _get_owned_file(file_id, db, user)

    if version_id:
        result = await db.execute(
            select(StudySummary).where(
                StudySummary.id == version_id,
                StudySummary.file_id == file_id,
                StudySummary.status == ContentStatus.completed,
            )
        )
    else:
        result = await db.execute(
            select(StudySummary).where(
                StudySummary.file_id == file_id,
                StudySummary.deleted_at.is_(None),
            )
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
        select(StudySummary).where(
            StudySummary.file_id == file_id,
            StudySummary.deleted_at.is_(None),
        )
    )
    summary = result.scalar_one_or_none()

    if summary and summary.status == ContentStatus.generating:
        raise HTTPException(
            status_code=409, detail="Summary generation already in progress"
        )

    usage_svc = UsageService()
    tier = UserTier(user.tier)
    allowed, _, _ = await usage_svc.check_and_consume(
        db, user, "quiz", STUDY_CREDIT_ESTIMATE
    )
    if not allowed:
        raise HTTPException(
            status_code=402,
            detail=LimitExceededError(
                detail="학습 AI 사용 한도를 초과했습니다. 요금제를 업그레이드하거나 크레딧을 구매하세요.",
                limit_type="quiz",
                current_usage=TIER_LIMITS[tier].quiz_per_window,
                limit=TIER_LIMITS[tier].quiz_per_window,
            ).model_dump(),
        )

    if summary is not None:
        summary.deleted_at = datetime.now(timezone.utc)
        await db.flush()

    new_summary = StudySummary(file_id=file_id, status=ContentStatus.generating)
    db.add(new_summary)
    await db.commit()

    dispatch_task("generate_study_summary", [file_id, user.id, STUDY_CREDIT_ESTIMATE])
    return {"status": "dispatched"}


@router.get("/{file_id}/flashcards", response_model=StudyFlashcardSetResponse)
async def get_flashcards(
    file_id: str,
    version_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _get_owned_file(file_id, db, user)

    if version_id:
        result = await db.execute(
            select(StudyFlashcardSet).where(
                StudyFlashcardSet.id == version_id,
                StudyFlashcardSet.file_id == file_id,
                StudyFlashcardSet.status == ContentStatus.completed,
            )
        )
    else:
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

    usage_svc = UsageService()
    tier = UserTier(user.tier)
    allowed, _, _ = await usage_svc.check_and_consume(
        db, user, "quiz", STUDY_CREDIT_ESTIMATE
    )
    if not allowed:
        raise HTTPException(
            status_code=402,
            detail=LimitExceededError(
                detail="학습 AI 사용 한도를 초과했습니다. 요금제를 업그레이드하거나 크레딧을 구매하세요.",
                limit_type="quiz",
                current_usage=TIER_LIMITS[tier].quiz_per_window,
                limit=TIER_LIMITS[tier].quiz_per_window,
            ).model_dump(),
        )

    if flashcard_set is not None:
        flashcard_set.deleted_at = datetime.now(timezone.utc)
        await db.flush()

    new_set = StudyFlashcardSet(
        file_id=file_id, status=ContentStatus.generating
    )
    db.add(new_set)
    await db.commit()

    dispatch_task(
        "generate_study_flashcards", [file_id, user.id, STUDY_CREDIT_ESTIMATE]
    )
    return {"status": "dispatched"}


@router.get("/{file_id}/mindmap", response_model=StudyMindmapResponse)
async def get_mindmap(
    file_id: str,
    version_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _get_owned_file(file_id, db, user)

    if version_id:
        result = await db.execute(
            select(StudyMindmap).where(
                StudyMindmap.id == version_id,
                StudyMindmap.file_id == file_id,
                StudyMindmap.status == ContentStatus.completed,
            )
        )
    else:
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

    usage_svc = UsageService()
    tier = UserTier(user.tier)
    allowed, _, _ = await usage_svc.check_and_consume(
        db, user, "quiz", STUDY_CREDIT_ESTIMATE
    )
    if not allowed:
        raise HTTPException(
            status_code=402,
            detail=LimitExceededError(
                detail="학습 AI 사용 한도를 초과했습니다. 요금제를 업그레이드하거나 크레딧을 구매하세요.",
                limit_type="quiz",
                current_usage=TIER_LIMITS[tier].quiz_per_window,
                limit=TIER_LIMITS[tier].quiz_per_window,
            ).model_dump(),
        )

    if mindmap is not None:
        mindmap.deleted_at = datetime.now(timezone.utc)
        await db.flush()

    new_mindmap = StudyMindmap(file_id=file_id, status=ContentStatus.generating)
    db.add(new_mindmap)
    await db.commit()

    dispatch_task("generate_study_mindmap", [file_id, user.id, STUDY_CREDIT_ESTIMATE])
    return {"status": "dispatched"}


@router.post(
    "/{file_id}/mindmap/node-explanation",
    response_model=MindmapNodeExplanationResponse,
)
async def get_mindmap_node_explanation(
    file_id: str,
    req: MindmapNodeExplanationRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _get_owned_file(file_id, db, user)

    redis_client = getattr(request.app.state, "redis", None)

    usage_svc = UsageService()
    tier = UserTier(user.tier)
    allowed, _, _ = await usage_svc.check_and_consume(
        db, user, "quiz", STUDY_CREDIT_ESTIMATE
    )
    if not allowed:
        raise HTTPException(
            status_code=402,
            detail=LimitExceededError(
                detail="학습 AI 사용 한도를 초과했습니다. 요금제를 업그레이드하거나 크레딧을 구매하세요.",
                limit_type="quiz",
                current_usage=TIER_LIMITS[tier].quiz_per_window,
                limit=TIER_LIMITS[tier].quiz_per_window,
            ).model_dump(),
        )
    await db.commit()

    try:
        label, explanation, from_cache = await generate_node_explanation(
            file_id=file_id,
            node_id=req.node_id,
            db=db,
            redis_client=redis_client,
            user_id=user.id,
            credit_estimate=STUDY_CREDIT_ESTIMATE,
        )
    except MindmapNotReadyError as exc:
        raise HTTPException(
            status_code=404,
            detail=f"Mindmap not available. Status: {exc}",
        )
    except NodeNotFoundError:
        raise HTTPException(
            status_code=404,
            detail="Node not found in mindmap",
        )
    except Exception as exc:
        logger.exception(
            "node_explanation: generation failed for file=%s node=%s: %s",
            file_id,
            req.node_id,
            exc,
        )
        raise HTTPException(
            status_code=500,
            detail="설명 생성에 실패했습니다. 잠시 후 다시 시도해주세요.",
        )

    return MindmapNodeExplanationResponse(
        node_id=req.node_id,
        node_label=label,
        explanation=explanation,
        cached=from_cache,
    )


@router.get(
    "/{file_id}/{content_type}/versions",
    response_model=ContentVersionsResponse,
)
async def get_content_versions(
    file_id: str,
    content_type: Literal["summary", "flashcards", "mindmap"],
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _get_owned_file(file_id, db, user)

    model_map = {
        "summary": StudySummary,
        "flashcards": StudyFlashcardSet,
        "mindmap": StudyMindmap,
    }
    model = model_map[content_type]

    result = await db.execute(
        select(model)
        .where(
            model.file_id == file_id,
            model.status == ContentStatus.completed,
        )
        .order_by(model.created_at.asc())
    )
    records = result.scalars().all()

    versions = [
        ContentVersionItem(
            id=r.id,
            generated_at=r.generated_at,
            model_used=r.model_used,
            is_current=r.deleted_at is None,
        )
        for r in records
    ]

    return ContentVersionsResponse(versions=versions, total=len(versions))


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


@router.post("/{file_id}/items/generate")
async def generate_study_items_endpoint(
    file_id: str,
    req: StudyItemGenerateRequest,
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
        select(StudyItemSet).where(
            StudyItemSet.file_id == file_id,
            StudyItemSet.item_type == req.item_type,
            StudyItemSet.difficulty == req.difficulty,
            StudyItemSet.deleted_at.is_(None),
        )
    )
    item_set = result.scalar_one_or_none()

    if item_set and item_set.status == ContentStatus.generating:
        raise HTTPException(
            status_code=409,
            detail="Study item generation already in progress",
        )

    usage_svc = UsageService()
    tier = UserTier(user.tier)
    allowed, _, _ = await usage_svc.check_and_consume(
        db, user, "quiz", STUDY_CREDIT_ESTIMATE
    )
    if not allowed:
        raise HTTPException(
            status_code=402,
            detail=LimitExceededError(
                detail="학습 AI 사용 한도를 초과했습니다. 요금제를 업그레이드하거나 크레딧을 구매하세요.",
                limit_type="quiz",
                current_usage=TIER_LIMITS[tier].quiz_per_window,
                limit=TIER_LIMITS[tier].quiz_per_window,
            ).model_dump(),
        )

    if req.force_regenerate and item_set:
        item_set.deleted_at = datetime.now(timezone.utc)
        await db.flush()
        item_set = None

    if item_set is None:
        item_set = StudyItemSet(
            file_id=file_id,
            item_type=req.item_type,
            difficulty=req.difficulty,
            count_requested=req.count,
            language=req.language,
            status=ContentStatus.generating,
        )
        db.add(item_set)
    else:
        item_set.status = ContentStatus.generating
        item_set.count_requested = req.count
        item_set.language = req.language
        item_set.error_code = None
        item_set.error_message = None
    await db.commit()

    dispatch_task(
        "generate_study_items",
        [
            file_id,
            user.id,
            STUDY_CREDIT_ESTIMATE,
            req.item_type,
            req.difficulty,
            req.count,
            req.language,
            req.force_regenerate,
        ],
    )
    return {"status": "dispatched"}


@router.get("/{file_id}/items", response_model=StudyItemSetResponse)
async def get_study_items(
    file_id: str,
    item_type: StudyItemType = Query(...),
    difficulty: StudyDifficulty = Query("medium"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _get_owned_file(file_id, db, user)

    result = await db.execute(
        select(StudyItemSet).where(
            StudyItemSet.file_id == file_id,
            StudyItemSet.item_type == item_type,
            StudyItemSet.difficulty == difficulty,
            StudyItemSet.deleted_at.is_(None),
        )
    )
    item_set = result.scalar_one_or_none()

    if item_set is None or item_set.status != ContentStatus.completed:
        status = (
            item_set.status.value
            if item_set
            else ContentStatus.not_generated.value
        )
        raise HTTPException(
            status_code=404,
            detail=f"Study items not available. Status: {status}",
        )

    items_result = await db.execute(
        select(StudyItem)
        .where(StudyItem.item_set_id == item_set.id)
        .order_by(StudyItem.order)
    )
    items = items_result.scalars().all()

    return StudyItemSetResponse.model_validate(
        {
            "id": item_set.id,
            "file_id": item_set.file_id,
            "item_type": item_set.item_type,
            "difficulty": item_set.difficulty,
            "count_requested": item_set.count_requested,
            "language": item_set.language,
            "status": item_set.status.value,
            "error_code": item_set.error_code,
            "error_message": item_set.error_message,
            "model_used": item_set.model_used,
            "generated_at": item_set.generated_at,
            "items": [StudyItemResponse.model_validate(i) for i in items],
        }
    )


@router.get("/{file_id}/items/status")
async def get_study_items_status(
    file_id: str,
    item_type: StudyItemType = Query(...),
    difficulty: StudyDifficulty = Query("medium"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _get_owned_file(file_id, db, user)

    result = await db.execute(
        select(StudyItemSet).where(
            StudyItemSet.file_id == file_id,
            StudyItemSet.item_type == item_type,
            StudyItemSet.difficulty == difficulty,
            StudyItemSet.deleted_at.is_(None),
        )
    )
    item_set = result.scalar_one_or_none()

    count_generated = 0
    if item_set and item_set.status == ContentStatus.completed:
        from sqlalchemy import func
        count_result = await db.execute(
            select(func.count(StudyItem.id)).where(
                StudyItem.item_set_id == item_set.id
            )
        )
        count_generated = count_result.scalar_one() or 0

    return {
        "file_id": file_id,
        "item_type": item_type,
        "difficulty": difficulty,
        "status": (
            item_set.status.value
            if item_set
            else ContentStatus.not_generated.value
        ),
        "error_code": item_set.error_code if item_set else None,
        "error_message": item_set.error_message if item_set else None,
        "count_generated": count_generated,
    }
