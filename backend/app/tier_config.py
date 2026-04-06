from dataclasses import dataclass
from enum import Enum


class UserTier(str, Enum):
    free = "free"
    learner = "learner"
    pro = "pro"


@dataclass(frozen=True)
class TierLimits:
    storage_bytes: int
    quiz_per_window: int  # -1 = unlimited
    ocr_pages_per_window: int  # -1 = unlimited
    allowed_models: list[str]


WINDOW_SECONDS = 8 * 60 * 60  # 8-hour rolling window

FREE_STORAGE_BYTES = 100 * 1024 * 1024  # 100 MB
LEARNER_STORAGE_BYTES = 5000 * 1024 * 1024  # 5,000 MB
PRO_STORAGE_BYTES = 1_000_000 * 1024 * 1024  # effectively unlimited

MODEL_ECO = "ECO"
MODEL_BALANCED = "BALANCED"
MODEL_PERFORMANCE = "PERFORMANCE"

TIER_LIMITS: dict[UserTier, TierLimits] = {
    UserTier.free: TierLimits(
        storage_bytes=FREE_STORAGE_BYTES,
        quiz_per_window=3,
        ocr_pages_per_window=1,
        allowed_models=[MODEL_ECO],
    ),
    UserTier.learner: TierLimits(
        storage_bytes=LEARNER_STORAGE_BYTES,
        quiz_per_window=100,
        ocr_pages_per_window=50,
        allowed_models=[MODEL_ECO, MODEL_BALANCED, MODEL_PERFORMANCE],
    ),
    UserTier.pro: TierLimits(
        storage_bytes=PRO_STORAGE_BYTES,
        quiz_per_window=-1,
        ocr_pages_per_window=-1,
        allowed_models=[MODEL_ECO, MODEL_BALANCED, MODEL_PERFORMANCE],
    ),
}
