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
        assert TIER_LIMITS[UserTier.free].quiz_per_window == 50.0

    def test_free_ocr_quota_is_50(self):
        assert TIER_LIMITS[UserTier.free].ocr_pages_per_window == 50

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
        allowed, remaining, source = await svc.check_and_consume(
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
        allowed, remaining, _ = await svc.check_and_consume(db_session, user, "quiz", 5)
        assert allowed is True
        assert remaining == 0

    async def test_free_user_exceeds_quota_is_denied(self, db_session):
        user = _make_user("free")
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)

        svc = UsageService()
        allowed, _, _ = await svc.check_and_consume(db_session, user, "quiz", 6)
        assert allowed is False

    async def test_quota_accumulates_across_calls(self, db_session):
        user = _make_user("free")
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)

        svc = UsageService()
        for _ in range(5):
            allowed, _, _ = await svc.check_and_consume(db_session, user, "quiz", 1)
            assert allowed is True

        allowed, remaining, _ = await svc.check_and_consume(db_session, user, "quiz", 1)
        assert allowed is False
        assert remaining == 0

    async def test_balanced_cost_consumes_3(self, db_session):
        user = _make_user("free")
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)

        svc = UsageService()
        allowed, _, _ = await svc.check_and_consume(db_session, user, "quiz", 3)
        assert allowed is True

        allowed, _, _ = await svc.check_and_consume(db_session, user, "quiz", 3)
        assert allowed is False

    async def test_performance_cost_consumes_5(self, db_session):
        user = _make_user("free")
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)

        svc = UsageService()
        allowed, _, _ = await svc.check_and_consume(db_session, user, "quiz", 5)
        assert allowed is True

        allowed, _, _ = await svc.check_and_consume(db_session, user, "quiz", 5)
        assert allowed is False

    async def test_window_reset_restores_quota(self, db_session):
        user = _make_user("free")
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)

        svc = UsageService()
        allowed, _, _ = await svc.check_and_consume(db_session, user, "quiz", 5)
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

        allowed, remaining, _ = await svc.check_and_consume(db_session, user, "quiz", 1)
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
            consumed=50,  # fully exhausted against 50.0 quiz_per_window quota
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

    async def test_eco_model_cost(
        self, free_auth_client: AsyncClient, free_user, db_session, free_user_ready_file
    ):
        """ECO model should deduct TIER_ESTIMATES[MODEL_ECO] from quota."""
        from app.config import settings
        from app.tier_config import TIER_ESTIMATES, MODEL_ECO

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
        from sqlalchemy import select

        result = await db_session.execute(
            select(UsageRecord).where(
                UsageRecord.user_id == free_user.id,
                UsageRecord.resource_type == "quiz",
            )
        )
        record = result.scalar_one_or_none()
        assert record is not None
        assert record.consumed == TIER_ESTIMATES[MODEL_ECO]

    async def test_balanced_model_cost(
        self, free_auth_client: AsyncClient, free_user, db_session, free_user_ready_file
    ):
        """BALANCED model should deduct TIER_ESTIMATES[MODEL_BALANCED] from quota."""
        from app.config import settings
        from app.tier_config import TIER_ESTIMATES, MODEL_BALANCED

        await free_auth_client.post(
            "/quiz-sessions",
            json={
                "mode": "normal",
                "selected_file_ids": [free_user_ready_file.id],
                "question_count": 3,
                "source_mode": "document_based",
                "preferred_model": settings.balanced_generation_model,
            },
        )
        from sqlalchemy import select

        result = await db_session.execute(
            select(UsageRecord).where(
                UsageRecord.user_id == free_user.id,
                UsageRecord.resource_type == "quiz",
            )
        )
        record = result.scalar_one_or_none()
        assert record is not None
        assert record.consumed == TIER_ESTIMATES[MODEL_BALANCED]

    async def test_performance_model_cost(
        self, free_auth_client: AsyncClient, free_user, db_session, free_user_ready_file
    ):
        """PERFORMANCE model should deduct TIER_ESTIMATES[MODEL_PERFORMANCE] from quota."""
        from app.config import settings
        from app.tier_config import TIER_ESTIMATES, MODEL_PERFORMANCE

        await free_auth_client.post(
            "/quiz-sessions",
            json={
                "mode": "normal",
                "selected_file_ids": [free_user_ready_file.id],
                "question_count": 3,
                "source_mode": "document_based",
                "preferred_model": settings.performance_generation_model,
            },
        )
        from sqlalchemy import select

        result = await db_session.execute(
            select(UsageRecord).where(
                UsageRecord.user_id == free_user.id,
                UsageRecord.resource_type == "quiz",
            )
        )
        record = result.scalar_one_or_none()
        assert record is not None
        assert record.consumed == TIER_ESTIMATES[MODEL_PERFORMANCE]

    async def test_max_model_exceeds_free_quota(
        self, free_auth_client: AsyncClient, free_user_ready_file, db_session
    ):
        """MAX model costs 12 credits — rejected when remaining quota < estimate."""
        from datetime import datetime, timedelta, timezone
        from app.config import settings
        from app.tier_config import TIER_ESTIMATES, TIER_LIMITS, MODEL_MAX, UserTier
        from app.models.billing import UsageRecord

        free_tier_limit = TIER_LIMITS[UserTier.free].quiz_per_window
        max_estimate = TIER_ESTIMATES[MODEL_MAX]
        assert max_estimate <= free_tier_limit

        now = datetime.now(timezone.utc)
        user_resp = await free_auth_client.get("/auth/me")
        user_id = user_resp.json()["id"]
        record = UsageRecord(
            user_id=user_id,
            resource_type="quiz",
            window_start=now,
            window_end=now + timedelta(days=30),
            consumed=free_tier_limit - max_estimate + 1,
        )
        db_session.add(record)
        await db_session.commit()

        resp = await free_auth_client.post(
            "/quiz-sessions",
            json={
                "mode": "normal",
                "selected_file_ids": [free_user_ready_file.id],
                "question_count": 3,
                "source_mode": "document_based",
                "preferred_model": settings.max_generation_model,
            },
        )
        assert resp.status_code == 402
        assert resp.json()["detail"]["limit_type"] == "quiz"
