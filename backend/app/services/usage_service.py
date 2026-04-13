from datetime import datetime, timedelta, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.billing import UsageRecord, CreditBalance
from app.schemas.billing import (
    UsageStatusResponse,
    UsageWindowSchema,
    CreditBalanceSchema,
)
from app.tier_config import TIER_LIMITS, WINDOW_DAYS, UserTier
from app.utils.db_helpers import get_or_create_credit_balance


class UsageService:
    async def _get_or_create_credit_balance(
        self, db: AsyncSession, user_id: str
    ) -> CreditBalance:
        return await get_or_create_credit_balance(db, user_id)

    async def _get_or_create_window(
        self, db: AsyncSession, user_id: str, resource_type: str
    ) -> UsageRecord:
        """
        SELECT FOR UPDATE — get existing window or create new one.
        If expired (now > window_end), reset in-place.
        """
        now = datetime.now(timezone.utc)
        result = await db.execute(
            select(UsageRecord)
            .where(
                UsageRecord.user_id == user_id,
                UsageRecord.resource_type == resource_type,
            )
            .with_for_update()
        )
        record = result.scalar_one_or_none()

        if record is None:
            record = UsageRecord(
                user_id=user_id,
                resource_type=resource_type,
                window_start=now,
                window_end=now + timedelta(days=WINDOW_DAYS),
                consumed=0,
            )
            db.add(record)
            await db.flush()
        elif now > record.window_end:
            record.window_start = now
            record.window_end = now + timedelta(days=WINDOW_DAYS)
            record.consumed = 0

        return record

    async def check_and_consume(
        self,
        db: AsyncSession,
        user: User,
        resource_type: str,
        amount: int = 1,
    ) -> tuple[bool, int, str]:
        """
        Returns (allowed, remaining, source).
        source = "tier" | "credit"
        Consumes tier allowance first, then credits.
        """
        tier = UserTier(user.tier)
        limits = TIER_LIMITS[tier]

        # Storage is cumulative, not rolling-window
        if resource_type == "storage":
            # Lock the User row to prevent concurrent quota check race condition
            result = await db.execute(
                select(User).where(User.id == user.id).with_for_update()
            )
            locked_user = result.scalar_one()

            balance = await self._get_or_create_credit_balance(db, user.id)
            tier_limit = limits.storage_bytes
            total_quota = tier_limit + balance.storage_credits_bytes
            projected = locked_user.storage_used_bytes + amount

            if projected > total_quota:
                return (False, 0, "tier")

            # Only charge credits for bytes that cross into the over-tier zone.
            # e.g. tier=5GB, used=4.8GB, upload=400MB → 200MB from tier, 200MB from credits.
            old_overage = max(0, locked_user.storage_used_bytes - tier_limit)
            new_overage = max(0, projected - tier_limit)
            credit_needed = new_overage - old_overage

            if credit_needed > 0:
                balance.storage_credits_bytes -= credit_needed

            locked_user.storage_used_bytes = projected
            remaining = total_quota - projected
            source = "credit" if new_overage > 0 else "tier"
            return (True, remaining, source)

        limit = (
            limits.quiz_per_window
            if resource_type == "quiz"
            else limits.ocr_pages_per_window
        )

        if limit == -1:
            return (True, -1, "tier")

        record = await self._get_or_create_window(db, user.id, resource_type)

        if record.consumed + amount <= limit:
            record.consumed += amount
            return (True, limit - record.consumed, "tier")

        return (False, 0, "tier")

    async def get_usage_status(
        self, db: AsyncSession, user: User
    ) -> UsageStatusResponse:
        now = datetime.now(timezone.utc)
        tier = UserTier(user.tier)
        limits = TIER_LIMITS[tier]
        balance = await self._get_or_create_credit_balance(db, user.id)

        windows = []
        for resource_type in ("quiz", "ocr"):
            result = await db.execute(
                select(UsageRecord).where(
                    UsageRecord.user_id == user.id,
                    UsageRecord.resource_type == resource_type,
                )
            )
            record = result.scalar_one_or_none()
            limit = (
                limits.quiz_per_window
                if resource_type == "quiz"
                else limits.ocr_pages_per_window
            )
            consumed = 0
            window_start = now
            window_end = now + timedelta(days=WINDOW_DAYS)
            if record and now <= record.window_end:
                consumed = record.consumed
                window_start = record.window_start
                window_end = record.window_end

            windows.append(
                UsageWindowSchema(
                    resource_type=resource_type,
                    consumed=consumed,
                    limit=limit,
                    window_starts_at=window_start,
                    window_ends_at=window_end,
                    source="tier",
                )
            )

        total_quota = limits.storage_bytes + balance.storage_credits_bytes
        windows.append(
            UsageWindowSchema(
                resource_type="storage",
                consumed=user.storage_used_bytes,
                limit=total_quota,
                window_starts_at=now,
                window_ends_at=now + timedelta(days=36500),  # effectively never
                source="tier"
                if user.storage_used_bytes <= limits.storage_bytes
                else "credit",
            )
        )

        return UsageStatusResponse(
            tier=user.tier,
            windows=windows,
            credits=CreditBalanceSchema(
                storage_credits_bytes=balance.storage_credits_bytes,
            ),
        )
