from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.billing import CreditBalance, CreditPurchase
from app.config import settings
from app.services.paddle_client import paddle

CREDIT_PACKS = {
    ("storage", "5gb"): {
        "price_id_setting": "paddle_storage_5gb_price_id",
        "storage_bytes": 5 * 1024 * 1024 * 1024,
        "ai_count": 0,
    },
    ("storage", "20gb"): {
        "price_id_setting": "paddle_storage_20gb_price_id",
        "storage_bytes": 20 * 1024 * 1024 * 1024,
        "ai_count": 0,
    },
    ("ai", "100"): {
        "price_id_setting": "paddle_ai_credits_100_price_id",
        "storage_bytes": 0,
        "ai_count": 100,
    },
    ("ai", "500"): {
        "price_id_setting": "paddle_ai_credits_500_price_id",
        "storage_bytes": 0,
        "ai_count": 500,
    },
}


class CreditService:
    async def get_balance(self, db: AsyncSession, user_id: str) -> CreditBalance:
        result = await db.execute(
            select(CreditBalance).where(CreditBalance.user_id == user_id)
        )
        balance = result.scalar_one_or_none()
        if balance is None:
            balance = CreditBalance(user_id=user_id)
            db.add(balance)
            await db.flush()
        return balance

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
        balance.ai_credits_count += ai_count

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
        resource_type: str,
        amount: int,
    ) -> bool:
        balance = await self.get_balance(db, user_id)

        if resource_type == "storage":
            if balance.storage_credits_bytes < amount:
                return False
            balance.storage_credits_bytes -= amount
        else:
            if balance.ai_credits_count < amount:
                return False
            balance.ai_credits_count -= amount

        await db.commit()
        return True

    def get_credit_pack_price_id(self, credit_type: str, pack_size: str) -> str:
        key = (credit_type, pack_size)
        pack = CREDIT_PACKS.get(key)
        if pack is None:
            raise ValueError(f"Unknown credit pack: {credit_type}/{pack_size}")
        price_id = getattr(settings, pack["price_id_setting"], "")
        return price_id

    def get_pack_amounts(self, credit_type: str, pack_size: str) -> tuple[int, int]:
        key = (credit_type, pack_size)
        pack = CREDIT_PACKS.get(key)
        if pack is None:
            raise ValueError(f"Unknown credit pack: {credit_type}/{pack_size}")
        return pack["storage_bytes"], pack["ai_count"]

    async def create_credit_checkout(
        self,
        customer_id: str,
        credit_type: str,
        pack_size: str,
        success_url: str,
        user_id: str,
    ) -> str:
        price_id = self.get_credit_pack_price_id(credit_type, pack_size)
        storage_bytes, ai_count = self.get_pack_amounts(credit_type, pack_size)

        transaction = await paddle.create_transaction(
            customer_id=customer_id,
            price_id=price_id,
            custom_data={
                "user_id": user_id,
                "credit_type": credit_type,
                "pack_size": pack_size,
                "storage_bytes": str(storage_bytes),
                "ai_count": str(ai_count),
            },
            success_url=success_url,
        )
        checkout = transaction.get("checkout") or {}
        return checkout.get("url", "")
