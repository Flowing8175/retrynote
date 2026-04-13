from __future__ import annotations

from typing import TYPE_CHECKING, TypeVar, Type, Protocol
from fastapi import HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import DeclarativeBase, Mapped

if TYPE_CHECKING:
    from app.models.billing import CreditBalance


class _OwnedModel(Protocol):
    id: Mapped[str]
    user_id: Mapped[str | None]


T = TypeVar("T", bound=_OwnedModel)


async def get_owned_or_raise(
    db: AsyncSession,
    model: Type[T],
    resource_id: str,
    user_id: str,
    *,
    not_found_detail: str = "Not found",
    forbidden_detail: str = "Access denied",
) -> T:
    result = await db.execute(select(model).where(model.id == resource_id))
    obj = result.scalar_one_or_none()
    if obj is None:
        raise HTTPException(status_code=404, detail=not_found_detail)
    if obj.user_id != user_id:
        raise HTTPException(status_code=403, detail=forbidden_detail)
    return obj


async def paginate(db: AsyncSession, query, page: int, size: int) -> tuple[list, int]:
    total_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = total_result.scalar_one()
    items_result = await db.execute(query.offset((page - 1) * size).limit(size))
    items = items_result.scalars().all()
    return list(items), total


async def get_or_create_credit_balance(db: AsyncSession, user_id: str) -> CreditBalance:
    """SELECT credit balance row for user_id, creating it if absent."""
    from app.models.billing import CreditBalance

    result = await db.execute(
        select(CreditBalance).where(CreditBalance.user_id == user_id)
    )
    balance = result.scalar_one_or_none()
    if balance is None:
        balance = CreditBalance(user_id=user_id)
        db.add(balance)
        await db.flush()
    return balance
