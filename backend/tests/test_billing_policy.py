import uuid
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select

from app.models.user import User, UserRole
from app.models.billing import UsageRecord
from app.tier_config import (
    TIER_LIMITS,
    UserTier,
    TierLimits,
    MODEL_ECO,
    MODEL_BALANCED,
    MODEL_PERFORMANCE,
)
from app.services.usage_service import UsageService
from app.schemas.billing import UsageStatusResponse
from app.middleware.auth import hash_password, create_access_token


def _make_user(tier: str = "free") -> User:
    return User(
        id=str(uuid.uuid4()),
        username=f"user_{uuid.uuid4().hex[:6]}",
        email=f"{uuid.uuid4().hex[:6]}@test.com",
        password_hash=hash_password("Pass123!"),
        role=UserRole.user,
        is_active=True,
        email_verified=True,
        tier=tier,
    )


class TestTierConfig:
    def test_free_quiz_quota(self):
        assert TIER_LIMITS[UserTier.free].quiz_per_window == 5.0

    def test_free_ocr_quota_is_5(self):
        assert TIER_LIMITS[UserTier.free].ocr_pages_per_window == 5

    def test_tier_limits_has_no_allowed_models_field(self):
        assert not hasattr(TierLimits, "allowed_models")
        assert not hasattr(TIER_LIMITS[UserTier.free], "allowed_models")

    def test_model_tier_constants(self):
        assert MODEL_ECO == "ECO"
        assert MODEL_BALANCED == "BALANCED"
        assert MODEL_PERFORMANCE == "PERFORMANCE"

    def test_paid_tiers_have_higher_quota_than_free(self):
        free_quota = TIER_LIMITS[UserTier.free].quiz_per_window
        for tier in (UserTier.lite, UserTier.standard, UserTier.pro):
            assert TIER_LIMITS[tier].quiz_per_window > free_quota


@pytest.mark.asyncio
class TestUsageServiceQuota:
    async def test_free_user_can_consume_within_quota(self, db_session):
        user = _make_user("free")
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)

        svc = UsageService()
        allowed, remaining, source, _ = await svc.check_and_consume(
            db_session, user, "quiz", 1
        )
        assert allowed is True
        assert source == "tier"
        assert remaining == 4

    async def test_free_user_exactly_at_quota(self, db_session):
        user = _make_user("free")
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)

        svc = UsageService()
        allowed, remaining, _, _ = await svc.check_and_consume(db_session, user, "quiz", 5)
        assert allowed is True
        assert remaining == 0

    async def test_free_user_exceeds_quota_is_denied(self, db_session):
        user = _make_user("free")
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)

        svc = UsageService()
        allowed, _, _, _ = await svc.check_and_consume(db_session, user, "quiz", 6)
        assert allowed is False

    async def test_quota_accumulates_across_calls(self, db_session):
        user = _make_user("free")
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)

        svc = UsageService()
        for _ in range(5):
            allowed, _, _, _ = await svc.check_and_consume(db_session, user, "quiz", 1)
            assert allowed is True

        allowed, remaining, _, _ = await svc.check_and_consume(db_session, user, "quiz", 1)
        assert allowed is False
        assert remaining == 0

    async def test_balanced_cost_consumes_3(self, db_session):
        user = _make_user("free")
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)

        svc = UsageService()
        allowed, _, _, _ = await svc.check_and_consume(db_session, user, "quiz", 3)
        assert allowed is True

        allowed, _, _, _ = await svc.check_and_consume(db_session, user, "quiz", 3)
        assert allowed is False

    async def test_performance_cost_consumes_5(self, db_session):
        user = _make_user("free")
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)

        svc = UsageService()
        allowed, _, _, _ = await svc.check_and_consume(db_session, user, "quiz", 5)
        assert allowed is True

        allowed, _, _, _ = await svc.check_and_consume(db_session, user, "quiz", 5)
        assert allowed is False

    async def test_window_reset_restores_quota(self, db_session):
        user = _make_user("free")
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)

        svc = UsageService()
        allowed, _, _, _ = await svc.check_and_consume(db_session, user, "quiz", 5)
        assert allowed is True

        result = await db_session.execute(
            select(UsageRecord).where(
                UsageRecord.user_id == user.id,
                UsageRecord.resource_type == "quiz",
            )
        )
        record = result.scalar_one()
        record.window_end = datetime.now(timezone.utc) - timedelta(seconds=1)
        await db_session.commit()

        allowed, remaining, _, _ = await svc.check_and_consume(db_session, user, "quiz", 1)
        assert allowed is True
        assert remaining == 4


# ---------------------------------------------------------------------------
# UsageService — get_usage_status schema (no free_trial fields)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestUsageStatusSchema:
    async def test_usage_status_has_no_free_trial_fields(self, db_session):
        user = _make_user("free")
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)

        svc = UsageService()
        status = await svc.get_usage_status(db_session, user)

        assert isinstance(status, UsageStatusResponse)
        assert not hasattr(status, "free_trial_used_at")
        assert not hasattr(status, "free_trial_available")

    async def test_usage_status_returns_quiz_window(self, db_session):
        user = _make_user("free")
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)

        svc = UsageService()
        status = await svc.get_usage_status(db_session, user)

        quiz_window = next(
            (w for w in status.windows if w.resource_type == "quiz"), None
        )
        assert quiz_window is not None
        assert quiz_window.limit == 5.0
        assert quiz_window.consumed == 0

    async def test_usage_status_consumed_reflects_actual_use(self, db_session):
        user = _make_user("free")
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)

        svc = UsageService()
        await svc.check_and_consume(db_session, user, "quiz", 3)
        status = await svc.get_usage_status(db_session, user)

        quiz_window = next(w for w in status.windows if w.resource_type == "quiz")
        assert quiz_window.consumed == 3
        assert quiz_window.limit == 5.0


# ---------------------------------------------------------------------------
# API — quiz creation enforces quota (402) and accepts all model tiers
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def free_user(db_session):
    user = _make_user("free")
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def free_auth_client(client, free_user):
    token = create_access_token(free_user.id, free_user.role.value)
    client.headers["Authorization"] = f"Bearer {token}"
    return client


@pytest_asyncio.fixture
async def free_user_ready_file(db_session, free_user):
    from app.models.file import File, FileSourceType, FileStatus

    file = File(
        id=str(uuid.uuid4()),
        user_id=free_user.id,
        original_filename="free_user_test.pdf",
        file_type="pdf",
        file_size_bytes=1024,
        source_type=FileSourceType.upload,
        status=FileStatus.ready,
        is_searchable=True,
        is_quiz_eligible=True,
    )
    db_session.add(file)
    await db_session.commit()
    await db_session.refresh(file)
    return file


@pytest.mark.asyncio
class TestQuizCreationPolicy:
    async def test_free_user_can_create_with_eco_model(
        self, free_auth_client: AsyncClient, free_user_ready_file
    ):
        """Free user must be able to use ECO model without restriction."""
        from app.config import settings

        resp = await free_auth_client.post(
            "/quiz-sessions",
            json={
                "mode": "normal",
                "selected_file_ids": [free_user_ready_file.id],
                "question_count": 3,
                "source_mode": "document_based",
                "preferred_model": settings.eco_generation_model,
            },
        )
        assert resp.status_code == 200

    async def test_free_user_can_create_with_balanced_model(
        self, free_auth_client: AsyncClient, free_user_ready_file
    ):
        """Free user must be able to use BALANCED model — no tier gating."""
        from app.config import settings

        resp = await free_auth_client.post(
            "/quiz-sessions",
            json={
                "mode": "normal",
                "selected_file_ids": [free_user_ready_file.id],
                "question_count": 3,
                "source_mode": "document_based",
                "preferred_model": settings.balanced_generation_model,
            },
        )
        assert resp.status_code == 200

    async def test_free_user_can_create_with_performance_model(
        self, free_auth_client: AsyncClient, free_user_ready_file
    ):
        """Free user must be able to use PERFORMANCE model — no tier gating."""
        from app.config import settings

        resp = await free_auth_client.post(
            "/quiz-sessions",
            json={
                "mode": "normal",
                "selected_file_ids": [free_user_ready_file.id],
                "question_count": 3,
                "source_mode": "document_based",
                "preferred_model": settings.performance_generation_model,
            },
        )
        assert resp.status_code == 200

    async def test_quota_exceeded_returns_402(
        self, free_auth_client: AsyncClient, free_user, db_session
    ):
        """When free user's quota is exhausted, API returns 402."""
        # Pre-fill the usage record to exhaust the quota
        from datetime import datetime, timedelta, timezone

        now = datetime.now(timezone.utc)
        record = UsageRecord(
            user_id=free_user.id,
            resource_type="quiz",
            window_start=now,
            window_end=now + timedelta(days=30),
            consumed=5,  # fully exhausted against 5.0 quiz_per_window quota
        )
        db_session.add(record)
        await db_session.commit()

        resp = await free_auth_client.post(
            "/quiz-sessions",
            json={
                "mode": "normal",
                "question_count": 3,
                "source_mode": "no_source",
            },
        )
        assert resp.status_code == 402
        data = resp.json()
        assert data["detail"]["limit_type"] == "quiz"

    async def test_no_precharge_on_quiz_creation(
        self, free_auth_client: AsyncClient, free_user, db_session, free_user_ready_file
    ):
        from app.config import settings
        from sqlalchemy import select

        await free_auth_client.post(
            "/quiz-sessions",
            json={
                "mode": "normal",
                "selected_file_ids": [free_user_ready_file.id],
                "question_count": 3,
                "source_mode": "document_based",
                "preferred_model": settings.eco_generation_model,
            },
        )

        result = await db_session.execute(
            select(UsageRecord).where(
                UsageRecord.user_id == free_user.id,
                UsageRecord.resource_type == "quiz",
            )
        )
        record = result.scalar_one_or_none()
        if record is not None:
            assert record.consumed == 0


# ---------------------------------------------------------------------------
# AI Credit Pack Tests — T11
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestAICreditBatchPurchase:
    async def test_add_credits_creates_batch_with_correct_expiry(self, db_session):
        from dateutil.relativedelta import relativedelta
        from app.services.credit_service import CreditService
        from app.models.billing import AICreditBatch

        user = _make_user("free")
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)

        svc = CreditService()
        await svc.add_credits(db_session, user.id, ai_count=200, paddle_transaction_id="txn-1")

        result = await db_session.execute(
            select(AICreditBatch).where(AICreditBatch.user_id == user.id)
        )
        batches = list(result.scalars().all())
        assert len(batches) == 1
        batch = batches[0]

        assert batch.amount_total == 200.0
        assert batch.amount_remaining == 200.0

        # add_credits uses datetime.utcnow() (naive); SQLite strips tz info.
        # Normalize both to UTC-naive for day-level comparison.
        def _strip_tz(dt: datetime) -> datetime:
            return dt.replace(tzinfo=None) if dt.tzinfo is not None else dt

        purchased = _strip_tz(batch.purchased_at)
        expected_expiry = purchased + relativedelta(months=3)
        actual_expiry = _strip_tz(batch.expires_at)

        assert actual_expiry.year == expected_expiry.year
        assert actual_expiry.month == expected_expiry.month
        assert actual_expiry.day == expected_expiry.day

    async def test_add_credits_does_not_modify_storage_credits(self, db_session):
        from app.services.credit_service import CreditService
        from app.utils.db_helpers import get_or_create_credit_balance

        user = _make_user("free")
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)

        balance = await get_or_create_credit_balance(db_session, user.id)
        balance.storage_credits_bytes = 5 * 1024 ** 3
        await db_session.commit()
        await db_session.refresh(balance)

        svc = CreditService()
        balance_after = await svc.add_credits(db_session, user.id, ai_count=100)

        assert balance_after.storage_credits_bytes == 5 * 1024 ** 3


@pytest.mark.asyncio
class TestAICreditFIFOConsumption:
    async def test_consumes_from_soonest_expiring_batch_first(self, db_session):
        from app.models.billing import AICreditBatch
        from app.services.usage_service import UsageService

        user = _make_user("free")
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)

        now = datetime.now(timezone.utc)
        batch_a = AICreditBatch(
            user_id=user.id,
            amount_total=50.0,
            amount_remaining=50.0,
            purchased_at=now,
            expires_at=now + timedelta(days=30),
        )
        batch_b = AICreditBatch(
            user_id=user.id,
            amount_total=50.0,
            amount_remaining=50.0,
            purchased_at=now,
            expires_at=now + timedelta(days=90),
        )
        db_session.add(batch_a)
        db_session.add(batch_b)
        await db_session.commit()
        await db_session.refresh(batch_a)
        await db_session.refresh(batch_b)
        batch_a_id = batch_a.id

        svc = UsageService()
        allowed, remaining, source, batch_ids = await svc.check_and_consume(
            db_session, user, "quiz", 30
        )

        await db_session.flush()
        await db_session.refresh(batch_a)
        await db_session.refresh(batch_b)

        assert allowed is True
        assert source == "ai_credit"
        assert batch_ids == [batch_a_id]
        assert round(batch_a.amount_remaining, 2) == 20.0
        assert round(batch_b.amount_remaining, 2) == 50.0

    async def test_falls_through_to_tier_when_batches_empty(self, db_session):
        from app.services.usage_service import UsageService

        user = _make_user("free")
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)

        svc = UsageService()
        allowed, remaining, source, batch_ids = await svc.check_and_consume(
            db_session, user, "quiz", 5
        )

        assert allowed is True
        assert source == "tier"
        assert batch_ids == []

        result = await db_session.execute(
            select(UsageRecord).where(
                UsageRecord.user_id == user.id,
                UsageRecord.resource_type == "quiz",
            )
        )
        record = result.scalar_one_or_none()
        assert record is not None
        assert record.consumed == 5

    async def test_falls_through_to_tier_when_all_batches_expired(self, db_session):
        from app.models.billing import AICreditBatch
        from app.services.usage_service import UsageService

        user = _make_user("free")
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)

        now = datetime.now(timezone.utc)
        expired_batch = AICreditBatch(
            user_id=user.id,
            amount_total=100.0,
            amount_remaining=100.0,
            purchased_at=now - timedelta(days=95),
            expires_at=now - timedelta(days=1),
        )
        db_session.add(expired_batch)
        await db_session.commit()
        await db_session.refresh(expired_batch)

        svc = UsageService()
        allowed, remaining, source, batch_ids = await svc.check_and_consume(
            db_session, user, "quiz", 3
        )

        await db_session.refresh(expired_batch)

        assert allowed is True
        assert source == "tier"
        assert batch_ids == []
        assert round(expired_batch.amount_remaining, 2) == 100.0

    async def test_spans_multiple_batches(self, db_session):
        from app.models.billing import AICreditBatch
        from app.services.usage_service import UsageService

        user = _make_user("free")
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)

        now = datetime.now(timezone.utc)
        batch_a = AICreditBatch(
            user_id=user.id,
            amount_total=50.0,
            amount_remaining=50.0,
            purchased_at=now,
            expires_at=now + timedelta(days=30),
        )
        batch_b = AICreditBatch(
            user_id=user.id,
            amount_total=100.0,
            amount_remaining=100.0,
            purchased_at=now,
            expires_at=now + timedelta(days=60),
        )
        db_session.add(batch_a)
        db_session.add(batch_b)
        await db_session.commit()
        await db_session.refresh(batch_a)
        await db_session.refresh(batch_b)
        batch_a_id = batch_a.id
        batch_b_id = batch_b.id

        svc = UsageService()
        allowed, remaining, source, batch_ids = await svc.check_and_consume(
            db_session, user, "quiz", 60
        )

        await db_session.flush()
        await db_session.refresh(batch_a)
        await db_session.refresh(batch_b)

        assert allowed is True
        assert source == "ai_credit"
        assert batch_ids == [batch_a_id, batch_b_id]
        assert round(batch_a.amount_remaining, 2) == 0.0
        assert round(batch_b.amount_remaining, 2) == 90.0

    async def test_concurrent_consumption_no_oversell(self, db_session):
        """Serial simulation of concurrent consumption — verifies no oversell.

        True async concurrency is not tested here because SQLite's StaticPool
        does not support row-level locking, making concurrent-session tests fragile.
        Serial calls on the same session verify FIFO depletion with no oversell:
        total consumed from batch == amount_total (10), nothing left over.

        Call #3 partially drains the batch (2 credits) then falls through to the
        tier rolling window for the remaining 2 credits. The free tier allows
        5 quiz credits per window; since calls #1 and #2 used batch credits only,
        the tier window is empty → 0 + 2 ≤ 5 → allowed=True, source='ai_credit'.
        """
        from app.models.billing import AICreditBatch
        from app.services.usage_service import UsageService

        user = _make_user("free")
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)

        now = datetime.now(timezone.utc)
        batch_a = AICreditBatch(
            user_id=user.id,
            amount_total=10.0,
            amount_remaining=10.0,
            purchased_at=now,
            expires_at=now + timedelta(days=30),
        )
        db_session.add(batch_a)
        await db_session.commit()
        await db_session.refresh(batch_a)

        svc = UsageService()

        # Call #1: consumes 4 from batch → batch remaining 6
        allowed1, _, source1, _ = await svc.check_and_consume(
            db_session, user, "quiz", 4
        )
        assert allowed1 is True
        assert source1 == "ai_credit"

        # Call #2: consumes 4 from batch → batch remaining 2
        allowed2, _, source2, _ = await svc.check_and_consume(
            db_session, user, "quiz", 4
        )
        assert allowed2 is True
        assert source2 == "ai_credit"

        # Call #3: batch has 2 remaining → 2 from batch + 2 from tier window
        # (free tier 5-credit window at 0; 0+2=2 ≤ 5 → allowed, source='ai_credit')
        allowed3, _, source3, _ = await svc.check_and_consume(
            db_session, user, "quiz", 4
        )
        assert allowed3 is True
        assert source3 == "ai_credit"

        await db_session.refresh(batch_a)

        # No oversell: 4+4+2 = 10 consumed from batch == amount_total; nothing left
        assert round(batch_a.amount_remaining, 2) == 0.0
        assert round(batch_a.amount_total - batch_a.amount_remaining, 2) == 10.0

    async def test_ocr_consumption_does_not_affect_ai_batches(self, db_session):
        from app.models.billing import AICreditBatch
        from app.services.usage_service import UsageService

        user = _make_user("free")
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)

        now = datetime.now(timezone.utc)
        batch = AICreditBatch(
            user_id=user.id,
            amount_total=200.0,
            amount_remaining=200.0,
            purchased_at=now,
            expires_at=now + timedelta(days=30),
        )
        db_session.add(batch)
        await db_session.commit()
        await db_session.refresh(batch)

        svc = UsageService()
        for _ in range(5):
            await svc.check_and_consume(db_session, user, "ocr", 1)

        await db_session.refresh(batch)
        assert round(batch.amount_remaining, 2) == 200.0

        result = await db_session.execute(
            select(UsageRecord).where(
                UsageRecord.user_id == user.id,
                UsageRecord.resource_type == "ocr",
            )
        )
        record = result.scalar_one_or_none()
        assert record is not None
        assert record.consumed == 5

    async def test_storage_consumption_does_not_affect_ai_batches(self, db_session):
        from app.models.billing import AICreditBatch
        from app.services.usage_service import UsageService

        user = _make_user("free")
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)

        now = datetime.now(timezone.utc)
        batch = AICreditBatch(
            user_id=user.id,
            amount_total=200.0,
            amount_remaining=200.0,
            purchased_at=now,
            expires_at=now + timedelta(days=30),
        )
        db_session.add(batch)
        await db_session.commit()
        await db_session.refresh(batch)

        svc = UsageService()
        # Free tier storage limit is 150 MB; requesting 1 GB will be denied.
        # Either allowed or denied, AI credit batches must remain untouched.
        await svc.check_and_consume(db_session, user, "storage", 1024 ** 3)

        await db_session.refresh(batch)
        assert round(batch.amount_remaining, 2) == 200.0





@pytest.mark.asyncio
class TestAICreditExpiration:
    async def test_expired_batch_skipped_during_consumption(self, db_session):
        from app.models.billing import AICreditBatch
        from app.services.usage_service import UsageService

        user = _make_user("free")
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)

        now = datetime.now(timezone.utc)
        expired = AICreditBatch(
            user_id=user.id,
            amount_total=100.0,
            amount_remaining=100.0,
            purchased_at=now - timedelta(days=95),
            expires_at=now - timedelta(days=1),
        )
        valid = AICreditBatch(
            user_id=user.id,
            amount_total=50.0,
            amount_remaining=50.0,
            purchased_at=now,
            expires_at=now + timedelta(days=30),
        )
        db_session.add(expired)
        db_session.add(valid)
        await db_session.commit()
        await db_session.refresh(expired)
        await db_session.refresh(valid)

        svc = UsageService()
        allowed, remaining, source, batch_ids = await svc.check_and_consume(
            db_session, user, "quiz", 5
        )

        await db_session.refresh(expired)
        await db_session.refresh(valid)

        assert allowed is True
        assert source == "ai_credit"
        assert round(expired.amount_remaining, 2) == 100.0
        assert round(valid.amount_remaining, 2) == 45.0

    async def test_usage_balance_excludes_expired_batches(self, db_session):
        from app.models.billing import AICreditBatch
        from app.services.usage_service import UsageService, _ensure_aware

        user = _make_user("free")
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)

        now = datetime.now(timezone.utc)
        expired = AICreditBatch(
            user_id=user.id,
            amount_total=100.0,
            amount_remaining=100.0,
            purchased_at=now - timedelta(days=95),
            expires_at=now - timedelta(days=1),
        )
        valid = AICreditBatch(
            user_id=user.id,
            amount_total=50.0,
            amount_remaining=50.0,
            purchased_at=now,
            expires_at=now + timedelta(days=30),
        )
        db_session.add(expired)
        db_session.add(valid)
        await db_session.commit()
        await db_session.refresh(valid)

        svc = UsageService()
        balance, soonest_expiry = await svc.get_ai_credit_balance(db_session, user.id)

        assert round(balance, 2) == 50.0
        assert soonest_expiry is not None
        valid_expiry_aware = _ensure_aware(valid.expires_at)
        soonest_aware = _ensure_aware(soonest_expiry)
        diff = abs(soonest_aware - valid_expiry_aware)
        assert diff < timedelta(seconds=1)
