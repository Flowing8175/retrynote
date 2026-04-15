import json
import logging
import re
from datetime import datetime, timezone

from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.billing import Subscription
from app.tier_config import TIER_LIMITS, FREE_STORAGE_BYTES, UserTier
from app.services.paddle_client import paddle, PaddleError

logger = logging.getLogger(__name__)


class SubscriptionService:
    async def get_or_create_paddle_customer(self, db: AsyncSession, user: User) -> str:
        if user.paddle_customer_id:
            return user.paddle_customer_id

        try:
            customer = await paddle.create_customer(
                email=user.email,
                custom_data={"user_id": user.id, "username": user.username},
            )
            customer_id = customer["id"]
        except PaddleError as e:
            if e.status_code != 409:
                raise
            customer_id = self._extract_customer_id_from_conflict(e.detail)
            if not customer_id:
                raise
            logger.info(
                "Paddle customer already exists for %s, reusing %s",
                user.email,
                customer_id,
            )

        user.paddle_customer_id = customer_id
        await db.commit()
        return customer_id

    @staticmethod
    def _extract_customer_id_from_conflict(detail: str) -> str | None:
        try:
            body = json.loads(detail)
            msg = body.get("error", {}).get("detail", "")
        except (json.JSONDecodeError, AttributeError):
            msg = detail
        match = re.search(r"customer of id (ctm_\w+)", msg)
        return match.group(1) if match else None

    async def create_subscription_checkout(
        self,
        customer_id: str,
        price_id: str,
        success_url: str,
        metadata: dict,
    ) -> str:
        transaction = await paddle.create_transaction(
            customer_id=customer_id,
            price_id=price_id,
            custom_data=metadata,
            success_url=success_url,
        )
        txn_id = transaction.get("id", "")
        if not txn_id:
            raise ValueError("Paddle returned a transaction without an id")
        return txn_id

    async def provision_tier(
        self,
        db: AsyncSession,
        user_id: str,
        tier: str,
        billing_cycle: str,
        paddle_subscription_id: str,
        paddle_customer_id: str,
        current_period_end: datetime | None,
        reset_tz: str = "Asia/Seoul",
    ) -> Subscription:
        result = await db.execute(
            select(Subscription).where(Subscription.user_id == user_id)
        )
        sub = result.scalar_one_or_none()
        if sub is None:
            sub = Subscription(user_id=user_id)
            db.add(sub)

        sub.tier = tier
        sub.billing_cycle = billing_cycle
        sub.paddle_subscription_id = paddle_subscription_id
        sub.status = "active"
        sub.current_period_end = current_period_end
        sub.reset_tz = reset_tz

        user_result = await db.execute(select(User).where(User.id == user_id))
        user = user_result.scalar_one_or_none()
        if user:
            user.tier = tier
            user.paddle_customer_id = paddle_customer_id
            tier_enum = UserTier(tier)
            user.storage_quota_bytes = TIER_LIMITS[tier_enum].storage_bytes

        await db.commit()
        await db.refresh(sub)
        return sub

    async def cancel_or_downgrade(self, db: AsyncSession, user_id: str) -> None:
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
        result = await db.execute(
            select(Subscription).where(
                Subscription.user_id == user_id,
                Subscription.status.in_(["active", "past_due", "trialing"]),
                or_(
                    Subscription.current_period_end.is_(None),
                    Subscription.current_period_end > datetime.now(timezone.utc),
                ),
            )
        )
        return result.scalar_one_or_none()
