import asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.billing import CreditBalance, CreditPurchase
from app.config import settings


# Credit pack definitions — intentionally less efficient than subscriptions
CREDIT_PACKS = {
    ("storage", "5gb"): {
        "price_id_setting": "stripe_storage_5gb_price_id",
        "storage_bytes": 5 * 1024 * 1024 * 1024,  # 5 GB
        "ai_count": 0,
    },
    ("storage", "20gb"): {
        "price_id_setting": "stripe_storage_20gb_price_id",
        "storage_bytes": 20 * 1024 * 1024 * 1024,  # 20 GB
        "ai_count": 0,
    },
    ("ai", "100"): {
        "price_id_setting": "stripe_ai_credits_100_price_id",
        "storage_bytes": 0,
        "ai_count": 100,
    },
    ("ai", "500"): {
        "price_id_setting": "stripe_ai_credits_500_price_id",
        "storage_bytes": 0,
        "ai_count": 500,
    },
}


class CreditService:
    async def get_balance(self, db: AsyncSession, user_id: str) -> CreditBalance:
        """Get or create CreditBalance row for user."""
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
        stripe_payment_intent_id: str | None = None,
    ) -> CreditBalance:
        """Add credits to balance. Record purchase in audit table."""
        balance = await self.get_balance(db, user_id)
        balance.storage_credits_bytes += storage_bytes
        balance.ai_credits_count += ai_count

        # Audit record
        if storage_bytes > 0:
            db.add(
                CreditPurchase(
                    user_id=user_id,
                    credit_type="storage",
                    amount=storage_bytes,
                    stripe_payment_intent_id=stripe_payment_intent_id,
                )
            )
        if ai_count > 0:
            db.add(
                CreditPurchase(
                    user_id=user_id,
                    credit_type="ai",
                    amount=ai_count,
                    stripe_payment_intent_id=stripe_payment_intent_id,
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
        """
        Deduct credits. Returns True if successful.
        resource_type='quiz'/'ocr' → deducts ai_credits_count
        resource_type='storage' → deducts storage_credits_bytes
        Never goes below 0.
        """
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
        """Map (credit_type, pack_size) → Stripe price ID from settings."""
        key = (credit_type, pack_size)
        pack = CREDIT_PACKS.get(key)
        if pack is None:
            raise ValueError(f"Unknown credit pack: {credit_type}/{pack_size}")
        price_id = getattr(settings, pack["price_id_setting"], "")
        return price_id

    def get_pack_amounts(self, credit_type: str, pack_size: str) -> tuple[int, int]:
        """Returns (storage_bytes, ai_count) for a pack."""
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
        cancel_url: str,
        user_id: str,
    ) -> str:
        """Create Stripe Checkout session for one-time credit pack. Returns session URL."""
        import stripe

        stripe.api_key = settings.stripe_secret_key

        price_id = self.get_credit_pack_price_id(credit_type, pack_size)
        storage_bytes, ai_count = self.get_pack_amounts(credit_type, pack_size)

        session = await asyncio.to_thread(
            stripe.checkout.Session.create,
            customer=customer_id,
            mode="payment",
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=success_url,
            cancel_url=cancel_url,
            metadata={
                "user_id": user_id,
                "credit_type": credit_type,
                "pack_size": pack_size,
                "storage_bytes": str(storage_bytes),
                "ai_count": str(ai_count),
            },
        )
        return session["url"]
