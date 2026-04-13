from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, or_, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.utils.db_helpers import paginate
from app.models.quiz import AnswerLog, QuizItem, QuizSession
from app.models.file import File
from app.models.user import User
from app.schemas.search import SearchResponse, SearchResultItem
from app.middleware.auth import get_current_user

router = APIRouter()


async def _search_files(
    db: AsyncSession,
    user_id: str,
    q: str,
    folder_id: str | None,
    page: int,
    size: int,
) -> tuple[list[SearchResultItem], int]:
    file_query = select(File).where(
        File.user_id == user_id,
        File.deleted_at.is_(None),
        or_(
            File.original_filename.ilike(f"%{q}%"),
            File.source_url.ilike(f"%{q}%"),
        ),
    )
    if folder_id:
        file_query = file_query.where(File.folder_id == folder_id)

    file_query = file_query.order_by(File.created_at.desc())
    files, total = await paginate(db, file_query, page, size)
    items = [
        SearchResultItem(
            result_type="file",
            title=f.original_filename or "Untitled",
            snippet=f"Status: {f.status.value}, Type: {f.file_type}",
            source_id=f.id,
            source_metadata={
                "file_type": f.file_type,
                "status": f.status.value,
            },
        )
        for f in files
    ]
    return items, total


async def _search_wrong_notes(
    db: AsyncSession,
    user_id: str,
    q: str,
    file_id: str | None,
    page: int,
    size: int,
) -> tuple[list[SearchResultItem], int]:
    note_query = (
        select(AnswerLog, QuizItem)
        .join(QuizItem, AnswerLog.quiz_item_id == QuizItem.id)
        .where(
            AnswerLog.user_id == user_id,
            AnswerLog.is_active_result.is_(True),
            AnswerLog.deleted_at.is_(None),
            or_(
                QuizItem.question_text.ilike(f"%{q}%"),
                QuizItem.explanation_text.ilike(f"%{q}%"),
                QuizItem.concept_label.ilike(f"%{q}%"),
                AnswerLog.user_answer_raw.ilike(f"%{q}%"),
            ),
        )
    )
    if file_id:
        from app.models.quiz import QuizSessionFile

        note_query = note_query.join(
            QuizSessionFile,
            QuizSessionFile.quiz_session_id == AnswerLog.quiz_session_id,
        ).where(QuizSessionFile.file_id == file_id)

    note_result = await db.execute(
        note_query.order_by(AnswerLog.graded_at.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    items = [
        SearchResultItem(
            result_type="wrong_note",
            title=quiz_item.question_text[:100],
            snippet=f"Judgement: {answer_log.judgement.value}, Concept: {quiz_item.concept_label}",
            source_id=answer_log.id,
            source_metadata={
                "judgement": answer_log.judgement.value,
                "concept_key": quiz_item.concept_key,
                "error_type": answer_log.error_type.value
                if answer_log.error_type
                else None,
            },
        )
        for answer_log, quiz_item in note_result.all()
    ]
    count_result = await db.execute(
        select(func.count()).select_from(note_query.subquery())
    )
    return items, (count_result.scalar() or 0)


async def _search_quiz_history(
    db: AsyncSession,
    user_id: str,
    q: str,
    page: int,
    size: int,
) -> tuple[list[SearchResultItem], int]:
    from sqlalchemy import exists as sa_exists

    quiz_query = select(QuizSession).where(
        QuizSession.user_id == user_id,
        QuizSession.deleted_at.is_(None),
        sa_exists(
            select(QuizItem.id).where(
                QuizItem.quiz_session_id == QuizSession.id,
                or_(
                    QuizItem.question_text.ilike(f"%{q}%"),
                    QuizItem.concept_label.ilike(f"%{q}%"),
                    QuizItem.category_tag.ilike(f"%{q}%"),
                ),
            )
        ),
    )
    quiz_query = quiz_query.order_by(QuizSession.created_at.desc())
    sessions, total = await paginate(db, quiz_query, page, size)
    items = [
        SearchResultItem(
            result_type="quiz_session",
            title=f"Quiz Session ({s.mode.value}, {s.question_count} questions)",
            snippet=f"Status: {s.status.value}, Score: {s.total_score}/{s.max_score}",
            source_id=s.id,
            source_metadata={
                "mode": s.mode.value,
                "status": s.status.value,
                "source_mode": s.source_mode.value,
            },
        )
        for s in sessions
    ]
    return items, total


@router.get("", response_model=SearchResponse)
async def search(
    q: str = Query(..., min_length=1),
    scope: str = Query("all", pattern="^(all|files|wrong_notes|quiz_history)$"),
    file_id: str | None = Query(None),
    folder_id: str | None = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    results: list[SearchResultItem] = []
    total = 0

    if scope in ("all", "files"):
        file_results, file_count = await _search_files(
            db, user.id, q, folder_id, page, size
        )
        results.extend(file_results)
        total += file_count

    if scope in ("all", "wrong_notes"):
        note_results, note_count = await _search_wrong_notes(
            db, user.id, q, file_id, page, size
        )
        results.extend(note_results)
        total += note_count

    if scope in ("all", "quiz_history"):
        quiz_results, quiz_count = await _search_quiz_history(
            db, user.id, q, page, size
        )
        results.extend(quiz_results)
        total += quiz_count

    return SearchResponse(results=results, total=total, page=page, size=size)
