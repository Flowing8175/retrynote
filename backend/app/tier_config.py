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

FREE_STORAGE_BYTES = 150 * 1024 * 1024  # 150 MB
LITE_STORAGE_BYTES = 3 * 1024 * 1024 * 1024  # 3 GB
STANDARD_STORAGE_BYTES = 15 * 1024 * 1024 * 1024  # 15 GB
PRO_STORAGE_BYTES = 50 * 1024 * 1024 * 1024  # 50 GB

MODEL_ECO = "ECO"
MODEL_BALANCED = "BALANCED"
MODEL_PERFORMANCE = "PERFORMANCE"
MODEL_MAX = "MAX"

TIER_LIMITS: dict[UserTier, TierLimits] = {
    UserTier.free: TierLimits(
        storage_bytes=FREE_STORAGE_BYTES,
        quiz_per_window=100.0,
        ocr_pages_per_window=100,
        max_upload_mb=5,
    ),
    UserTier.lite: TierLimits(
        storage_bytes=LITE_STORAGE_BYTES,
        quiz_per_window=1200.0,
        ocr_pages_per_window=2000,
        max_upload_mb=50,
    ),
    UserTier.standard: TierLimits(
        storage_bytes=STANDARD_STORAGE_BYTES,
        quiz_per_window=4000.0,
        ocr_pages_per_window=10000,
        max_upload_mb=100,
    ),
    UserTier.pro: TierLimits(
        storage_bytes=PRO_STORAGE_BYTES,
        quiz_per_window=14000.0,
        ocr_pages_per_window=40000,
        max_upload_mb=200,
    ),
}

# Credits per 1K tokens, by model tier.
# Rates calibrated from actual API pricing (Apr 2026):
#   gpt-5.4-nano      — $0.20/$1.25 per 1M (in/out)
#   gpt-5.4-mini      — $0.75/$4.50 per 1M (in/out)
#   gemini-3-flash     — $0.50/$3.00 per 1M (in/out)
#   claude-sonnet-4-6  — $3.00/$15.00 per 1M (in/out)
MODEL_CREDIT_RATES: dict[str, float] = {
    MODEL_ECO: 0.10,  # gpt-5.4-nano — cheapest
    MODEL_BALANCED: 0.35,  # gpt-5.4-mini — mid-range
    MODEL_PERFORMANCE: 0.25,  # gemini-3-flash — fast & affordable
    MODEL_MAX: 1.20,  # claude-sonnet-4-6 — top-tier reasoning
}

# Pre-charge estimates for async operations (quiz gen, retry, objection).
# Actual cost is reconciled in the worker after the AI call completes.
TIER_ESTIMATES: dict[str, float] = {
    MODEL_ECO: 1.0,
    MODEL_BALANCED: 3.5,
    MODEL_PERFORMANCE: 2.5,
    MODEL_MAX: 12.0,
}

# Pre-charge estimate for study AI calls (summary, flashcards, mindmap, chat).
STUDY_CREDIT_ESTIMATE = 0.5


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
