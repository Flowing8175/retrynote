import logging
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.billing import CreditBalance, CreditPurchase
from app.config import settings
from app.services.paddle_client import paddle
from app.utils.db_helpers import get_or_create_credit_balance

logger = logging.getLogger(__name__)

CREDIT_PACKS = {
    ("storage", "5gb"): {
        "price_id_setting": "paddle_storage_5gb_price_id",
        "storage_bytes": 5 * 1024 * 1024 * 1024,
    },
    ("storage", "20gb"): {
        "price_id_setting": "paddle_storage_20gb_price_id",
        "storage_bytes": 20 * 1024 * 1024 * 1024,
    },
    ("storage", "50gb"): {
        "price_id_setting": "paddle_storage_50gb_price_id",
        "storage_bytes": 50 * 1024 * 1024 * 1024,
    },
}


class CreditService:
    async def get_balance(self, db: AsyncSession, user_id: str) -> CreditBalance:
        return await get_or_create_credit_balance(db, user_id)

    async def add_credits(
        self,
        db: AsyncSession,
        user_id: str,
        storage_bytes: int = 0,
        ai_count: int = 0,
        paddle_transaction_id: str | None = None,
    ) -> CreditBalance:
        balance = await self.get_balance(db, user_id)
        balance.storage_credits_bytes += storage_bytes

        if storage_bytes > 0:
            db.add(
                CreditPurchase(
                    user_id=user_id,
                    credit_type="storage",
                    amount=storage_bytes,
                    paddle_transaction_id=paddle_transaction_id,
                )
            )

        if ai_count > 0:
            logger.warning(
                "add_credits: ai_count=%d received but AI credits not yet supported",
                ai_count,
            )

        await db.commit()
        await db.refresh(balance)
        return balance

    async def consume_credits(
        self,
        db: AsyncSession,
        user_id: str,
        amount: int,
    ) -> bool:
        balance = await self.get_balance(db, user_id)

        if balance.storage_credits_bytes < amount:
            return False
        balance.storage_credits_bytes -= amount

        await db.commit()
        return True

    def get_credit_pack_price_id(self, credit_type: str, pack_size: str) -> str:
        key = (credit_type, pack_size)
        pack = CREDIT_PACKS.get(key)
        if pack is None:
            raise ValueError(f"Unknown credit pack: {credit_type}/{pack_size}")
        price_id = getattr(settings, pack["price_id_setting"], "")
        return price_id

    def get_pack_amounts(self, credit_type: str, pack_size: str) -> int:
        key = (credit_type, pack_size)
        pack = CREDIT_PACKS.get(key)
        if pack is None:
            raise ValueError(f"Unknown credit pack: {credit_type}/{pack_size}")
        return pack["storage_bytes"]

    async def create_credit_checkout(
        self,
        customer_id: str,
        credit_type: str,
        pack_size: str,
        success_url: str,
        user_id: str,
    ) -> str:
        price_id = self.get_credit_pack_price_id(credit_type, pack_size)
        storage_bytes = self.get_pack_amounts(credit_type, pack_size)

        transaction = await paddle.create_transaction(
            customer_id=customer_id,
            price_id=price_id,
            custom_data={
                "user_id": user_id,
                "credit_type": credit_type,
                "pack_size": pack_size,
                "storage_bytes": str(storage_bytes),
            },
            success_url=success_url,
        )
        checkout = transaction.get("checkout") or {}
        return checkout.get("url", "")
