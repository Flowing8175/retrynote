import logging
from datetime import datetime

from dateutil.relativedelta import relativedelta
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.billing import AICreditBatch, CreditBalance, CreditPurchase
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
    ("ai", "50"): {"price_id_setting": "paddle_ai_50_price_id", "ai_count": 50},
    ("ai", "200"): {"price_id_setting": "paddle_ai_200_price_id", "ai_count": 200},
    ("ai", "500"): {"price_id_setting": "paddle_ai_500_price_id", "ai_count": 500},
}

VALID_AI_PACK_SIZES = {"50", "200", "500"}


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
            now = datetime.utcnow()
            expires_at = now + relativedelta(months=3)
            batch = AICreditBatch(
                user_id=user_id,
                amount_total=float(ai_count),
                amount_remaining=float(ai_count),
                purchased_at=now,
                expires_at=expires_at,
                paddle_transaction_id=paddle_transaction_id,
            )
            db.add(batch)
            db.add(
                CreditPurchase(
                    user_id=user_id,
                    credit_type="ai",
                    amount=ai_count,
                    paddle_transaction_id=paddle_transaction_id,
                )
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
        key = (credit_type, pack_size)
        pack = CREDIT_PACKS.get(key)
        if pack is None:
            raise ValueError(f"Unknown credit pack: {credit_type}/{pack_size}")

        custom_data = {
            "user_id": user_id,
            "credit_type": credit_type,
            "pack_size": pack_size,
        }

        if credit_type == "storage":
            custom_data["storage_bytes"] = str(pack["storage_bytes"])
        elif credit_type == "ai":
            custom_data["ai_count"] = str(pack["ai_count"])
        else:
            raise ValueError(f"Unknown credit_type: {credit_type}")

        transaction = await paddle.create_transaction(
            customer_id=customer_id,
            price_id=price_id,
            custom_data=custom_data,
            success_url=success_url,
        )
        txn_id = transaction.get("id", "")
        if not txn_id:
            raise ValueError("Paddle returned a transaction without an id")
        return txn_id
