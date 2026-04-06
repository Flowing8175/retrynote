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
from app.tier_config import TIER_LIMITS, WINDOW_SECONDS, UserTier, FREE_STORAGE_BYTES


class UsageService:
    async def _get_or_create_credit_balance(
        self, db: AsyncSession, user_id: str
    ) -> CreditBalance:
        result = await db.execute(
            select(CreditBalance).where(CreditBalance.user_id == user_id)
        )
        balance = result.scalar_one_or_none()
        if balance is None:
            balance = CreditBalance(user_id=user_id)
            db.add(balance)
            await db.flush()
        return balance

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
                window_end=now + timedelta(seconds=WINDOW_SECONDS),
                consumed=0,
            )
            db.add(record)
            await db.flush()
        elif now > record.window_end:
            record.window_start = now
            record.window_end = now + timedelta(seconds=WINDOW_SECONDS)
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
            balance = await self._get_or_create_credit_balance(db, user.id)
            total_quota = limits.storage_bytes + balance.storage_credits_bytes
            projected = user.storage_used_bytes + amount
            if projected <= limits.storage_bytes:
                return (True, limits.storage_bytes - projected, "tier")
            elif projected <= total_quota:
                credit_needed = projected - limits.storage_bytes
                balance.storage_credits_bytes = max(
                    0, balance.storage_credits_bytes - credit_needed
                )
                return (True, total_quota - projected, "credit")
            else:
                return (False, 0, "tier")

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

        balance = await self._get_or_create_credit_balance(db, user.id)
        if resource_type in ("quiz", "ocr") and balance.ai_credits_count >= amount:
            balance.ai_credits_count -= amount
            return (True, balance.ai_credits_count, "credit")

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
            window_end = now + timedelta(seconds=WINDOW_SECONDS)
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

        free_trial_available = False
        if tier == UserTier.free:
            if user.free_trial_used_at is None:
                free_trial_available = True
            else:
                trial_at = user.free_trial_used_at
                if trial_at.tzinfo is None:
                    trial_at = trial_at.replace(tzinfo=timezone.utc)
                free_trial_available = (now - trial_at) > timedelta(days=7)

        return UsageStatusResponse(
            tier=user.tier,
            windows=windows,
            credits=CreditBalanceSchema(
                storage_credits_bytes=balance.storage_credits_bytes,
                ai_credits_count=balance.ai_credits_count,
            ),
            free_trial_used_at=user.free_trial_used_at,
            free_trial_available=free_trial_available,
        )
