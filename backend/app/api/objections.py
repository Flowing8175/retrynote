from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.objection import Objection
from app.schemas.objection import ObjectionDetail
from app.middleware.auth import get_current_user
from app.models.user import User
from app.utils.db_helpers import get_owned_or_raise

router = APIRouter()


@router.get("/{objection_id}", response_model=ObjectionDetail)
async def get_objection(
    objection_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    objection = await get_owned_or_raise(
        db,
        Objection,
        objection_id,
        user.id,
        not_found_detail="Objection not found",
        forbidden_detail="Access denied",
    )

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
