from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import uuid

from app.database import get_db
from app.models.quiz import (
    QuizSession,
    QuizItem,
    AnswerLog,
    Judgement,
    QuizSessionStatus,
)
from app.models.objection import Objection, ObjectionStatus
from app.models.user import User
from app.models.search import Job
from app.schemas.objection import ObjectionCreate, ObjectionResponse, ObjectionDetail
from app.middleware.auth import get_current_user
from app.workers.celery_app import celery_app

router = APIRouter()


@router.post(
    "/quiz-sessions/{session_id}/items/{item_id}/objections",
    response_model=ObjectionResponse,
)
async def create_objection(
    session_id: str,
    item_id: str,
    req: ObjectionCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    session_result = await db.execute(
        select(QuizSession).where(QuizSession.id == session_id)
    )
    session = session_result.scalar_one_or_none()
    if not session or session.user_id != user.id:
        raise HTTPException(status_code=404, detail="Session not found")

    answer_result = await db.execute(
        select(AnswerLog).where(
            AnswerLog.id == req.answer_log_id,
            AnswerLog.quiz_item_id == item_id,
            AnswerLog.user_id == user.id,
            AnswerLog.is_active_result == True,
        )
    )
    answer_log = answer_result.scalar_one_or_none()
    if not answer_log:
        raise HTTPException(status_code=404, detail="Answer log not found")

    existing = await db.execute(
        select(Objection).where(
            Objection.answer_log_id == req.answer_log_id,
            Objection.status.in_(
                [ObjectionStatus.submitted, ObjectionStatus.under_review]
            ),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=400, detail="Objection already pending for this answer"
        )

    objection = Objection(
        user_id=user.id,
        quiz_session_id=session_id,
        quiz_item_id=item_id,
        answer_log_id=req.answer_log_id,
        objection_reason=req.objection_reason,
        status=ObjectionStatus.submitted,
    )
    db.add(objection)

    if session.status == QuizSessionStatus.graded:
        session.status = QuizSessionStatus.objection_pending

    job = Job(
        id=str(uuid.uuid4()),
        job_type="objection_review",
        status="pending",
        target_type="objection",
        target_id=objection.id,
    )
    db.add(job)

    objection.status = ObjectionStatus.under_review
    await db.commit()
    await db.refresh(objection)

    celery_app.send_task("review_objection", args=[job.id])

    return ObjectionResponse(objection_id=objection.id, status=objection.status.value)


@router.get("/{objection_id}", response_model=ObjectionDetail)
async def get_objection(
    objection_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(Objection).where(Objection.id == objection_id))
    objection = result.scalar_one_or_none()
    if not objection:
        raise HTTPException(status_code=404, detail="Objection not found")
    if objection.user_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    return ObjectionDetail(
        id=objection.id,
        quiz_session_id=objection.quiz_session_id,
        quiz_item_id=objection.quiz_item_id,
        answer_log_id=objection.answer_log_id,
        objection_reason=objection.objection_reason,
        status=objection.status.value,
        review_result=objection.review_result_json,
        decided_at=objection.decided_at,
        decided_by=objection.decided_by,
        created_at=objection.created_at,
    )
