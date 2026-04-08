from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.models.objection import WeakPoint
from app.schemas.diagram import DiagramGenerateRequest, DiagramResponse
from app.services.diagram_service import (
    get_cached_diagram,
    generate_diagram,
    DiagramGenerationError,
)
from app.middleware.auth import get_current_user

router = APIRouter()


@router.post("/generate", response_model=DiagramResponse)
async def generate_concept_diagram(
    request: DiagramGenerateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(WeakPoint).where(
            WeakPoint.user_id == user.id,
            WeakPoint.concept_key == request.concept_key,
        )
    )
    weak_point = result.scalar_one_or_none()
    if weak_point is None:
        raise HTTPException(status_code=404, detail="개념을 찾을 수 없습니다")

    if not request.force:
        cached = await get_cached_diagram(db, user.id, request.concept_key)
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

    try:
        diagram = await generate_diagram(
            db,
            user.id,
            request.concept_key,
            weak_point.concept_label or request.concept_key,
            weak_point.category_tag,
        )
    except DiagramGenerationError:
        raise HTTPException(status_code=500, detail="다이어그램 생성에 실패했습니다")

    await db.commit()
    return diagram


@router.get("/{concept_key}", response_model=DiagramResponse)
async def get_diagram(
    concept_key: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    cached = await get_cached_diagram(db, user.id, concept_key)
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
