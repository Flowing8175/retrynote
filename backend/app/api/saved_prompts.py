from fastapi import APIRouter, Depends, HTTPException, Path
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.saved_prompt import SavedPrompt
from app.models.user import User
from app.schemas.saved_prompt import (
    SavedPromptCreate,
    SavedPromptResponse,
    SavedPromptUpsert,
)

router = APIRouter()

MAX_SLOTS = 3


async def _list_user_prompts(db: AsyncSession, user_id: str) -> list[SavedPrompt]:
    result = await db.execute(
        select(SavedPrompt)
        .where(SavedPrompt.user_id == user_id)
        .order_by(SavedPrompt.slot.asc())
    )
    return list(result.scalars().all())


@router.get("", response_model=list[SavedPromptResponse])
async def list_saved_prompts(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    prompts = await _list_user_prompts(db, user.id)
    return [SavedPromptResponse.model_validate(p) for p in prompts]


@router.post("", response_model=SavedPromptResponse, status_code=201)
async def create_saved_prompt(
    payload: SavedPromptCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    prompts = await _list_user_prompts(db, user.id)
    used_slots = {p.slot for p in prompts}
    empty_slot = next((s for s in range(1, MAX_SLOTS + 1) if s not in used_slots), None)
    if empty_slot is None:
        raise HTTPException(
            status_code=409,
            detail="저장된 프롬프트가 최대 3개에 도달했습니다. 기존 프롬프트를 삭제한 뒤 다시 시도해 주세요.",
        )

    prompt = SavedPrompt(
        user_id=user.id,
        slot=empty_slot,
        content=payload.content.strip(),
    )
    db.add(prompt)
    await db.commit()
    await db.refresh(prompt)
    return SavedPromptResponse.model_validate(prompt)


@router.put("/{slot}", response_model=SavedPromptResponse)
async def upsert_saved_prompt(
    payload: SavedPromptUpsert,
    slot: int = Path(ge=1, le=MAX_SLOTS),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(SavedPrompt).where(
            SavedPrompt.user_id == user.id,
            SavedPrompt.slot == slot,
        )
    )
    prompt = result.scalar_one_or_none()
    content = payload.content.strip()
    if prompt is None:
        prompt = SavedPrompt(user_id=user.id, slot=slot, content=content)
        db.add(prompt)
    else:
        prompt.content = content
    await db.commit()
    await db.refresh(prompt)
    return SavedPromptResponse.model_validate(prompt)


@router.delete("/{slot}", status_code=204)
async def delete_saved_prompt(
    slot: int = Path(ge=1, le=MAX_SLOTS),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(SavedPrompt).where(
            SavedPrompt.user_id == user.id,
            SavedPrompt.slot == slot,
        )
    )
    prompt = result.scalar_one_or_none()
    if prompt is not None:
        await db.delete(prompt)
        await db.commit()
    return None
