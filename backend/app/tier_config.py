from dataclasses import dataclass
from enum import Enum


class UserTier(str, Enum):
    free = "free"
    lite = "lite"
    standard = "standard"
    pro = "pro"


@dataclass(frozen=True)
class TierLimits:
    storage_bytes: int
    quiz_per_window: float
    ocr_pages_per_window: int
    max_upload_mb: int


WINDOW_DAYS = 30  # 30-day rolling window
STORAGE_CLEANUP_GRACE_DAYS = 5

FREE_STORAGE_BYTES = 50 * 1024 * 1024  # 50 MB
LITE_STORAGE_BYTES = 2 * 1024 * 1024 * 1024  # 2 GB
STANDARD_STORAGE_BYTES = 10 * 1024 * 1024 * 1024  # 10 GB
PRO_STORAGE_BYTES = 20 * 1024 * 1024 * 1024  # 20 GB

MODEL_ECO = "ECO"
MODEL_BALANCED = "BALANCED"
MODEL_PERFORMANCE = "PERFORMANCE"
MODEL_MAX = "MAX"

TIER_LIMITS: dict[UserTier, TierLimits] = {
    UserTier.free: TierLimits(
        storage_bytes=FREE_STORAGE_BYTES,
        quiz_per_window=5.0,
        ocr_pages_per_window=5,
        max_upload_mb=5,
    ),
    UserTier.lite: TierLimits(
        storage_bytes=LITE_STORAGE_BYTES,
        quiz_per_window=60.0,
        ocr_pages_per_window=100,
        max_upload_mb=50,
    ),
    UserTier.standard: TierLimits(
        storage_bytes=STANDARD_STORAGE_BYTES,
        quiz_per_window=200.0,
        ocr_pages_per_window=500,
        max_upload_mb=100,
    ),
    UserTier.pro: TierLimits(
        storage_bytes=PRO_STORAGE_BYTES,
        quiz_per_window=700.0,
        ocr_pages_per_window=2000,
        max_upload_mb=200,
    ),
}

# Credits per 1K tokens, by model tier
MODEL_CREDIT_RATES: dict[str, float] = {
    MODEL_ECO: 0.10,  # gpt-5.4-nano — cheapest
    MODEL_BALANCED: 0.35,  # gpt-5.4-mini — mid-range
    MODEL_PERFORMANCE: 0.65,  # gemini-3-flash-preview — premium pricing
    MODEL_MAX: 1.20,  # claude-sonnet-4-6 — top-tier reasoning
}


def get_model_tier(model_name: str) -> str:
    """Map a concrete model name to its tier label."""
    from app.config import settings

    if model_name == settings.eco_generation_model:
        return MODEL_ECO
    if model_name == settings.performance_generation_model:
        return MODEL_PERFORMANCE
    if model_name == settings.max_generation_model:
        return MODEL_MAX
    return MODEL_BALANCED


def calculate_credit_cost(total_tokens: int, model_name: str) -> float:
    """Convert token usage to credit cost (10x markup). Rounded to 2dp."""
    tier = get_model_tier(model_name)
    rate = MODEL_CREDIT_RATES.get(tier, MODEL_CREDIT_RATES[MODEL_BALANCED])
    return round(total_tokens / 1000 * rate, 2)
