import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.quiz import (
    QuizSession,
    QuizSessionStatus,
    QuizMode,
    SourceMode,
    QuizItem,
    AnswerLog,
    Judgement,
)
from app.models.objection import WeakPoint
from app.models.user import User
from app.models.search import Job
from app.schemas.retry import RetrySetCreate, RetrySetResponse
from app.middleware.auth import get_current_user
from app.workers.celery_app import dispatch_task

router = APIRouter()


@router.post("", response_model=RetrySetResponse)
async def create_retry_set(
    req: RetrySetCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    concept_keys = req.concept_keys

    if req.source == "wrong_notes":
        if not concept_keys:
            weak_result = await db.execute(
                select(WeakPoint)
                .where(WeakPoint.user_id == user.id)
                .order_by(WeakPoint.wrong_count.desc())
                .limit(5)
            )
            concept_keys = [w.concept_key for w in weak_result.scalars().all()]

        # Fallback: derive concept keys directly from AnswerLog when WeakPoint is empty
        if not concept_keys:
            from sqlalchemy import distinct
            log_result = await db.execute(
                select(distinct(QuizItem.concept_key))
                .join(AnswerLog, AnswerLog.quiz_item_id == QuizItem.id)
                .where(
                    AnswerLog.user_id == user.id,
                    AnswerLog.is_active_result.is_(True),
                    AnswerLog.deleted_at.is_(None),
                    AnswerLog.judgement.in_(
                        [Judgement.incorrect, Judgement.partial, Judgement.skipped]
                    ),
                    QuizItem.concept_key.isnot(None),
                    QuizItem.concept_key != "",
                )
                .order_by(QuizItem.concept_key)
                .limit(5)
            )
            concept_keys = [k for k in log_result.scalars().all() if k]

    elif req.source == "quiz_session":
        if not req.quiz_session_id:
            raise HTTPException(status_code=400, detail="quiz_session_id is required for quiz_session source")
        session_check = await db.execute(
            select(QuizSession).where(
                QuizSession.id == req.quiz_session_id,
                QuizSession.user_id == user.id,
            )
        )
        if not session_check.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Quiz session not found")

        from sqlalchemy import distinct
        log_result = await db.execute(
            select(distinct(QuizItem.concept_key))
            .join(AnswerLog, AnswerLog.quiz_item_id == QuizItem.id)
            .where(
                AnswerLog.quiz_session_id == req.quiz_session_id,
                AnswerLog.user_id == user.id,
                AnswerLog.is_active_result.is_(True),
                AnswerLog.deleted_at.is_(None),
                AnswerLog.judgement.in_(
                    [Judgement.incorrect, Judgement.partial, Judgement.skipped]
                ),
                QuizItem.concept_key.isnot(None),
                QuizItem.concept_key != "",
            )
        )
        concept_keys = [k for k in log_result.scalars().all() if k]

        # Fallback: use all concept_keys in this session regardless of judgement
        if not concept_keys:
            all_result = await db.execute(
                select(distinct(QuizItem.concept_key))
                .where(
                    QuizItem.quiz_session_id == req.quiz_session_id,
                    QuizItem.concept_key.isnot(None),
                    QuizItem.concept_key != "",
                )
            )
            concept_keys = [k for k in all_result.scalars().all() if k]

    elif req.source == "dashboard_recommendation":
        weak_result = await db.execute(
            select(WeakPoint)
            .where(WeakPoint.user_id == user.id)
            .order_by(
                (
                    WeakPoint.wrong_count
                    + WeakPoint.partial_count
                    + WeakPoint.skip_count
                ).desc()
            )
            .limit(10)
        )
        concept_keys = [w.concept_key for w in weak_result.scalars().all()]

    if not concept_keys:
        raise HTTPException(status_code=400, detail="No weak concepts found for retry")

    effective_size = req.size if req.size is not None else 10

    session = QuizSession(
        user_id=user.id,
        mode=QuizMode.normal,
        source_mode=SourceMode.document_based,
        status=QuizSessionStatus.draft,
        question_count=effective_size,
        generation_priority="retry",
    )
    db.add(session)
    await db.flush()

    job = Job(
        id=str(uuid.uuid4()),
        job_type="retry_generation",
        status="pending",
        target_type="quiz_session",
        target_id=session.id,
        payload_json={
            "concept_keys": concept_keys,
            "size": effective_size,
            "source": req.source,
        },
    )
    db.add(job)
    session.status = QuizSessionStatus.generating

    await db.commit()
    await db.refresh(session)

    dispatch_task("generate_quiz", [job.id])

    return RetrySetResponse(quiz_session_id=session.id, job_id=job.id)
