from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.models.quiz import QuizItem, QuizSession
from app.schemas.diagram import DiagramGenerateRequest, DiagramResponse
from app.schemas.billing import LimitExceededError
from app.services.diagram_service import (
    get_cached_diagram,
    generate_diagram,
    DiagramGenerationError,
)
from app.services.usage_service import UsageService
from app.tier_config import TIER_LIMITS, UserTier
from app.middleware.auth import get_current_user

router = APIRouter()


@router.post("/generate", response_model=DiagramResponse)
async def generate_concept_diagram(
    request: DiagramGenerateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    qi_result = await db.execute(
        select(QuizItem)
        .join(QuizSession, QuizItem.quiz_session_id == QuizSession.id)
        .where(
            QuizSession.user_id == user.id,
            QuizItem.concept_key == request.concept_key,
        )
        .limit(1)
    )
    quiz_item = qi_result.scalar_one_or_none()
    if quiz_item is None:
        raise HTTPException(status_code=404, detail="개념을 찾을 수 없습니다")

    concept_label = quiz_item.concept_label or request.concept_key
    category_tag = quiz_item.category_tag

    if not request.force:
        cached = await get_cached_diagram(
            db, user.id, request.concept_key, request.diagram_type
        )
        if cached is not None:
            return DiagramResponse(
                concept_key=cached.concept_key,
                concept_label=cached.concept_label,
                diagram_type=cached.diagram_type,
                mermaid_code=cached.mermaid_code,
                title=cached.title,
                cached=True,
                created_at=cached.created_at,
            )

    usage_svc = UsageService()
    tier = UserTier(user.tier)
    allowed, _, _ = await usage_svc.check_and_consume(db, user, "quiz", 1)
    if not allowed:
        raise HTTPException(
            status_code=402,
            detail=LimitExceededError(
                detail="다이어그램 생성 크레딧이 부족합니다.",
                limit_type="quiz",
                current_usage=TIER_LIMITS[tier].quiz_per_window,
                limit=TIER_LIMITS[tier].quiz_per_window,
                upgrade_url="/pricing",
            ).model_dump(),
        )

    try:
        diagram = await generate_diagram(
            db,
            user.id,
            request.concept_key,
            concept_label,
            category_tag,
            requested_diagram_type=request.diagram_type,
        )
    except DiagramGenerationError:
        raise HTTPException(status_code=500, detail="다이어그램 생성에 실패했습니다")

    await db.commit()
    return diagram


@router.get("/{concept_key}", response_model=DiagramResponse)
async def get_diagram(
    concept_key: str,
    diagram_type: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    cached = await get_cached_diagram(db, user.id, concept_key, diagram_type)
    if cached is None:
        raise HTTPException(status_code=404, detail="다이어그램을 찾을 수 없습니다")

    return DiagramResponse(
        concept_key=cached.concept_key,
        concept_label=cached.concept_label,
        diagram_type=cached.diagram_type,
        mermaid_code=cached.mermaid_code,
        title=cached.title,
        cached=True,
        created_at=cached.created_at,
    )
