import asyncio
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.billing import Subscription
from app.config import settings
from app.tier_config import TIER_LIMITS, FREE_STORAGE_BYTES, UserTier


class SubscriptionService:
    async def get_or_create_stripe_customer(self, db: AsyncSession, user: User) -> str:
        """Lazy creation — only hit Stripe API if user has no customer ID."""
        if user.stripe_customer_id:
            return user.stripe_customer_id

        import stripe

        stripe.api_key = settings.stripe_secret_key

        customer = await asyncio.to_thread(
            stripe.Customer.create,
            email=user.email,
            metadata={"user_id": user.id, "username": user.username},
        )
        user.stripe_customer_id = customer["id"]
        await db.commit()
        return customer["id"]

    async def create_subscription_checkout(
        self,
        customer_id: str,
        price_id: str,
        success_url: str,
        cancel_url: str,
        metadata: dict,
    ) -> str:
        """Create Stripe Checkout session for subscription. Returns session URL."""
        import stripe

        stripe.api_key = settings.stripe_secret_key

        session = await asyncio.to_thread(
            stripe.checkout.Session.create,
            customer=customer_id,
            mode="subscription",
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=success_url,
            cancel_url=cancel_url,
            metadata=metadata,
        )
        return session["url"]

    async def provision_tier(
        self,
        db: AsyncSession,
        user_id: str,
        tier: str,
        billing_cycle: str,
        stripe_subscription_id: str,
        stripe_customer_id: str,
        current_period_end: datetime,
        reset_tz: str = "Asia/Seoul",
    ) -> Subscription:
        """Upsert Subscription row, update User.tier and storage_quota_bytes."""
        result = await db.execute(
            select(Subscription).where(Subscription.user_id == user_id)
        )
        sub = result.scalar_one_or_none()
        if sub is None:
            sub = Subscription(user_id=user_id)
            db.add(sub)

        sub.tier = tier
        sub.billing_cycle = billing_cycle
        sub.stripe_subscription_id = stripe_subscription_id
        sub.stripe_customer_id = stripe_customer_id
        sub.status = "active"
        sub.current_period_end = current_period_end
        sub.reset_tz = reset_tz

        user_result = await db.execute(select(User).where(User.id == user_id))
        user = user_result.scalar_one_or_none()
        if user:
            user.tier = tier
            tier_enum = UserTier(tier)
            user.storage_quota_bytes = TIER_LIMITS[tier_enum].storage_bytes

        await db.commit()
        await db.refresh(sub)
        return sub

    async def cancel_or_downgrade(self, db: AsyncSession, user_id: str) -> None:
        """On subscription cancel/expire: set tier to free. Files NOT deleted. Credits survive."""
        result = await db.execute(
            select(Subscription).where(Subscription.user_id == user_id)
        )
        sub = result.scalar_one_or_none()
        if sub:
            sub.status = "canceled"

        user_result = await db.execute(select(User).where(User.id == user_id))
        user = user_result.scalar_one_or_none()
        if user:
            user.tier = "free"
            user.storage_quota_bytes = FREE_STORAGE_BYTES

        await db.commit()

    async def get_current(self, db: AsyncSession, user_id: str) -> Subscription | None:
        """Return active subscription or None."""
        result = await db.execute(
            select(Subscription).where(
                Subscription.user_id == user_id,
                Subscription.status.in_(["active", "past_due", "trialing"]),
            )
        )
        return result.scalar_one_or_none()
