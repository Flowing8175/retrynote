import logging
from datetime import datetime, timedelta, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

from app.models.user import User
from app.models.billing import UsageRecord, CreditBalance, AICreditBatch
from app.schemas.billing import (
    UsageStatusResponse,
    UsageWindowSchema,
    CreditBalanceSchema,
)
from app.tier_config import TIER_LIMITS, WINDOW_DAYS, UserTier
from app.utils.db_helpers import get_or_create_credit_balance


def _ensure_aware(dt: datetime) -> datetime:
    """SQLite returns naive datetimes even from TIMESTAMP WITH TIME ZONE
    columns; normalize to UTC so comparisons against tz-aware `now` work
    uniformly across Postgres (prod) and SQLite (tests)."""
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


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
        elif now > _ensure_aware(record.window_end):
            record.window_start = now
            record.window_end = now + timedelta(days=WINDOW_DAYS)
            record.consumed = 0

        return record

    async def _get_active_ai_batches(
        self, db: AsyncSession, user_id: str
    ) -> list[AICreditBatch]:
        now = datetime.now(timezone.utc)
        result = await db.execute(
            select(AICreditBatch)
            .where(
                AICreditBatch.user_id == user_id,
                AICreditBatch.deleted_at == None,  # noqa: E711
                AICreditBatch.expires_at > now,
                AICreditBatch.amount_remaining > 0,
            )
            .order_by(AICreditBatch.expires_at.asc())
            .with_for_update()
        )
        return list(result.scalars().all())

    def _consume_from_batches(
        self, batches: list[AICreditBatch], amount: float
    ) -> tuple[float, list[str]]:
        amount_left = amount
        consumed_total = 0.0
        batch_ids: list[str] = []

        for batch in batches:
            if amount_left <= 0:
                break
            deducted = min(batch.amount_remaining, amount_left)
            if deducted > 0:
                batch.amount_remaining = round(
                    max(0.0, batch.amount_remaining - deducted), 2
                )
                amount_left -= deducted
                consumed_total += deducted
                batch_ids.append(batch.id)

        return (consumed_total, batch_ids)

    async def has_quota(
        self,
        db: AsyncSession,
        user: User,
        resource_type: str,
    ) -> bool:
        tier = UserTier(user.tier)
        limits = TIER_LIMITS[tier]

        if resource_type == "quiz":
            batches = await self._get_active_ai_batches(db, user.id)
            if batches and sum(b.amount_remaining for b in batches) > 0:
                return True

        limit = (
            limits.quiz_per_window
            if resource_type == "quiz"
            else limits.ocr_pages_per_window
        )
        if limit == -1:
            return True

        record = await self._get_or_create_window(db, user.id, resource_type)
        return record.consumed < limit

    async def check_and_consume(
        self,
        db: AsyncSession,
        user: User,
        resource_type: str,
        amount: float = 1.0,
    ) -> tuple[bool, float, str, list[str]]:
        """
        Returns (allowed, remaining, source, batch_ids).
        source = "tier" | "credit" | "ai_credit"
        For quiz: AI credit batches consumed first (FIFO by expires_at),
        remainder falls through to tier rolling-window.
        batch_ids contains IDs of AICreditBatch rows consumed; empty for
        non-quiz paths and quiz paths that hit only the tier window.
        """
        tier = UserTier(user.tier)
        limits = TIER_LIMITS[tier]

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
                return (False, 0, "tier", [])

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
            return (True, remaining, source, [])

        batch_ids: list[str] = []

        if resource_type == "quiz":
            batches = await self._get_active_ai_batches(db, user.id)
            if batches:
                consumed_from_credits, batch_ids = self._consume_from_batches(
                    batches, amount
                )
                if consumed_from_credits >= amount:
                    remaining_credits = sum(b.amount_remaining for b in batches)
                    return (True, remaining_credits, "ai_credit", batch_ids)
                amount = amount - consumed_from_credits

        limit = (
            limits.quiz_per_window
            if resource_type == "quiz"
            else limits.ocr_pages_per_window
        )

        if limit == -1:
            return (True, -1, "tier", [])

        record = await self._get_or_create_window(db, user.id, resource_type)

        if record.consumed + amount <= limit:
            record.consumed += amount
            source = "ai_credit" if batch_ids else "tier"
            return (True, limit - record.consumed, source, batch_ids)

        return (False, 0, "tier", [])

    async def get_ai_credit_balance(
        self, db: AsyncSession, user_id: str
    ) -> tuple[float, datetime | None]:
        now = datetime.now(timezone.utc)
        result = await db.execute(
            select(AICreditBatch)
            .where(
                AICreditBatch.user_id == user_id,
                AICreditBatch.deleted_at == None,  # noqa: E711
                AICreditBatch.expires_at > now,
                AICreditBatch.amount_remaining > 0,
            )
            .order_by(AICreditBatch.expires_at.asc())
        )
        batches = list(result.scalars().all())
        if not batches:
            return (0.0, None)
        total_remaining = sum(b.amount_remaining for b in batches)
        soonest_expiry = _ensure_aware(batches[0].expires_at)
        return (total_remaining, soonest_expiry)

    async def consume_actual(
        self,
        db: AsyncSession,
        user_id: str,
        resource_type: str,
        amount: float,
    ) -> tuple[str, list[str]]:
        """Charge actual usage after AI generation completes.

        Tries AI credit batches first (FIFO by expiry), remainder
        falls through to the rolling-window tier quota.
        Returns (source, batch_ids) for logging/tracking.
        Does NOT call db.commit() — caller owns the transaction.
        """
        if amount <= 0:
            return ("tier", [])

        batch_ids: list[str] = []

        if resource_type == "quiz":
            batches = await self._get_active_ai_batches(db, user_id)
            if batches:
                consumed, batch_ids = self._consume_from_batches(batches, amount)
                if consumed >= amount:
                    return ("ai_credit", batch_ids)
                amount -= consumed

        record = await self._get_or_create_window(db, user_id, resource_type)
        record.consumed = round(record.consumed + amount, 2)
        source = "ai_credit" if batch_ids else "tier"
        return (source, batch_ids)

    async def get_usage_status(
        self, db: AsyncSession, user: User
    ) -> UsageStatusResponse:
        now = datetime.now(timezone.utc)
        tier = UserTier(user.tier)
        limits = TIER_LIMITS[tier]
        balance = await self._get_or_create_credit_balance(db, user.id)

        # Fetch both quiz and ocr records in a single query
        result = await db.execute(
            select(UsageRecord).where(
                UsageRecord.user_id == user.id,
                UsageRecord.resource_type.in_(["quiz", "ocr"]),
            )
        )
        records = result.scalars().all()

        # Build a map of resource_type -> record for quick lookup
        usage_map = {record.resource_type: record for record in records}

        windows = []
        for resource_type in ("quiz", "ocr"):
            record = usage_map.get(resource_type)
            limit = (
                limits.quiz_per_window
                if resource_type == "quiz"
                else limits.ocr_pages_per_window
            )
            consumed = 0
            window_start = now
            window_end = now + timedelta(days=WINDOW_DAYS)
            if record and now <= _ensure_aware(record.window_end):
                consumed = record.consumed
                window_start = _ensure_aware(record.window_start)
                window_end = _ensure_aware(record.window_end)

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

        ai_balance, ai_expires = await self.get_ai_credit_balance(db, user.id)
        return UsageStatusResponse(
            tier=user.tier,
            windows=windows,
            credits=CreditBalanceSchema(
                storage_credits_bytes=balance.storage_credits_bytes,
                ai_credits_balance=ai_balance,
                ai_credits_expires_at=ai_expires,
            ),
        )
