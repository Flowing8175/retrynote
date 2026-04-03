from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.objection import Objection
from app.schemas.objection import ObjectionDetail
from app.middleware.auth import get_current_user
from app.models.user import User

router = APIRouter()


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
