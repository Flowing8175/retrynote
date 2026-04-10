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
    quiz_per_window: int
    ocr_pages_per_window: int


WINDOW_DAYS = 30  # 30-day rolling window

FREE_STORAGE_BYTES = 150 * 1024 * 1024  # 150 MB
LITE_STORAGE_BYTES = 3 * 1024 * 1024 * 1024  # 3 GB
STANDARD_STORAGE_BYTES = 15 * 1024 * 1024 * 1024  # 15 GB
PRO_STORAGE_BYTES = 50 * 1024 * 1024 * 1024  # 50 GB

MODEL_ECO = "ECO"
MODEL_BALANCED = "BALANCED"
MODEL_PERFORMANCE = "PERFORMANCE"

TIER_LIMITS: dict[UserTier, TierLimits] = {
    UserTier.free: TierLimits(
        storage_bytes=FREE_STORAGE_BYTES,
        quiz_per_window=20,
        ocr_pages_per_window=5,
    ),
    UserTier.lite: TierLimits(
        storage_bytes=LITE_STORAGE_BYTES,
        quiz_per_window=50,
        ocr_pages_per_window=100,
    ),
    UserTier.standard: TierLimits(
        storage_bytes=STANDARD_STORAGE_BYTES,
        quiz_per_window=300,
        ocr_pages_per_window=500,
    ),
    UserTier.pro: TierLimits(
        storage_bytes=PRO_STORAGE_BYTES,
        quiz_per_window=1000,
        ocr_pages_per_window=2000,
    ),
}
