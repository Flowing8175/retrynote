import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
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
    QuizSessionFile,
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

    session = QuizSession(
        user_id=user.id,
        mode=QuizMode.normal,
        source_mode=SourceMode.document_based,
        status=QuizSessionStatus.draft,
        question_count=req.size,
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
            "size": req.size,
            "source": req.source,
        },
    )
    db.add(job)
    session.status = QuizSessionStatus.generating

    await db.commit()
    await db.refresh(session)

    await dispatch_task("generate_quiz", [job.id])

    return RetrySetResponse(quiz_session_id=session.id, job_id=job.id)
