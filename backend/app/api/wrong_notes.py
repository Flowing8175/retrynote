from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.quiz import AnswerLog, QuizItem, QuizSession, Judgement, ErrorType
from app.models.file import File
from app.models.objection import WeakPoint
from app.models.user import User
from app.schemas.wrong_note import (
    WrongNoteItem,
    WrongNoteListResponse,
    WrongNoteErrorTypeUpdate,
)
from app.middleware.auth import get_current_user

router = APIRouter()


@router.get("", response_model=WrongNoteListResponse)
async def list_wrong_notes(
    sort: str = Query("concept", pattern="^(concept|date|question)$"),
    judgement: list[str] = Query(None),
    error_type: list[str] = Query(None),
    file_id: str | None = Query(None),
    category_tag: str | None = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = (
        select(AnswerLog, QuizItem, QuizSession)
        .join(QuizItem, AnswerLog.quiz_item_id == QuizItem.id)
        .join(QuizSession, AnswerLog.quiz_session_id == QuizSession.id)
        .where(
            AnswerLog.user_id == user.id,
            AnswerLog.is_active_result == True,
            AnswerLog.deleted_at.is_(None),
            QuizSession.deleted_at.is_(None),
            QuizSession.source_mode != "no_source",
        )
    )

    try:
        judgement_enums = [Judgement(j) for j in judgement] if judgement else None
        error_type_enums = [ErrorType(e) for e in error_type] if error_type else None
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    if judgement_enums:
        query = query.where(AnswerLog.judgement.in_(judgement_enums))
    else:
        query = query.where(
            AnswerLog.judgement.in_(
                [Judgement.incorrect, Judgement.partial, Judgement.skipped]
            )
        )
    if error_type_enums:
        query = query.where(AnswerLog.error_type.in_(error_type_enums))
    if file_id:
        from app.models.quiz import QuizSessionFile

        query = query.join(
            QuizSessionFile, QuizSessionFile.quiz_session_id == QuizSession.id
        ).where(QuizSessionFile.file_id == file_id)
    if category_tag:
        query = query.where(QuizItem.category_tag == category_tag)

    total_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = total_result.scalar() or 0

    if sort == "date":
        query = query.order_by(AnswerLog.graded_at.desc())
    elif sort == "concept":
        query = query.order_by(QuizItem.concept_key, AnswerLog.graded_at.desc())
    else:
        query = query.order_by(QuizItem.question_text, AnswerLog.graded_at.desc())

    query = query.offset((page - 1) * size).limit(size)
    result = await db.execute(query)
    rows = result.all()

    items = []
    if rows:
        session_ids = {qs.id for _, _, qs in rows}
        from app.models.quiz import QuizSessionFile

        sf_result = await db.execute(
            select(QuizSessionFile, File)
            .join(File, File.id == QuizSessionFile.file_id)
            .where(QuizSessionFile.quiz_session_id.in_(session_ids))
        )
        session_file_map: dict[str, tuple[str, str | None]] = {}
        for sf, f in sf_result.all():
            if sf.quiz_session_id not in session_file_map:
                session_file_map[sf.quiz_session_id] = (
                    sf.file_id,
                    f.original_filename if f else None,
                )

        for answer_log, quiz_item, quiz_session in rows:
            file_id_val, filename = session_file_map.get(quiz_session.id, (None, None))
            items.append(
                WrongNoteItem(
                    id=answer_log.id,
                    question_text=quiz_item.question_text,
                    question_type=quiz_item.question_type.value,
                    options=quiz_item.options_json,
                    correct_answer=quiz_item.correct_answer_json,
                    user_answer_raw=answer_log.user_answer_raw,
                    user_answer_normalized=answer_log.user_answer_normalized,
                    judgement=answer_log.judgement.value,
                    score_awarded=answer_log.score_awarded,
                    max_score=answer_log.max_score,
                    explanation=quiz_item.explanation_text,
                    concept_key=quiz_item.concept_key,
                    concept_label=quiz_item.concept_label,
                    category_tag=quiz_item.category_tag,
                    error_type=answer_log.error_type.value
                    if answer_log.error_type
                    else None,
                    missing_points=answer_log.missing_points_json,
                    graded_at=answer_log.graded_at,
                    file_id=file_id_val,
                    original_filename=filename,
                    created_at=answer_log.created_at,
                )
            )

    return WrongNoteListResponse(items=items, total=total, page=page, size=size)


@router.patch("/{answer_log_id}/error-type")
async def update_error_type(
    answer_log_id: str,
    req: WrongNoteErrorTypeUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(AnswerLog).where(
            AnswerLog.id == answer_log_id,
            AnswerLog.user_id == user.id,
            AnswerLog.is_active_result == True,
        )
    )
    answer_log = result.scalar_one_or_none()
    if not answer_log:
        raise HTTPException(status_code=404, detail="Answer log not found")

    allowed_changes = {
        ErrorType.careless_mistake.value,
        ErrorType.no_response.value,
    }
    if req.error_type not in allowed_changes:
        raise HTTPException(
            status_code=400,
            detail="Only careless_mistake and no_response can be modified by user",
        )

    answer_log.error_type = ErrorType(req.error_type)
    await db.commit()
    return {"status": "success"}
