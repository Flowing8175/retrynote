from datetime import datetime
from pydantic import BaseModel, ConfigDict


class UsageWindowSchema(BaseModel):
    resource_type: str
    consumed: int
    limit: int  # -1 = unlimited
    window_starts_at: datetime
    window_ends_at: datetime
    source: str  # "tier" | "credit"


class CreditBalanceSchema(BaseModel):
    storage_credits_bytes: int
    ai_credits_count: int


class UsageStatusResponse(BaseModel):
    tier: str
    windows: list[UsageWindowSchema]
    credits: CreditBalanceSchema
    free_trial_used_at: datetime | None
    free_trial_available: bool


class SubscriptionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    tier: str
    billing_cycle: str
    status: str
    current_period_end: datetime | None


class CheckoutRequest(BaseModel):
    plan: str  # "learner" | "pro"
    billing_cycle: str  # "monthly" | "quarterly"


class CreditCheckoutRequest(BaseModel):
    credit_type: str  # "storage" | "ai"
    pack_size: str  # "5gb" | "20gb" | "100" | "500"


class CheckoutResponse(BaseModel):
    session_url: str


class PortalResponse(BaseModel):
    portal_url: str


class LimitExceededError(BaseModel):
    detail: str
    limit_type: str  # "quiz" | "ocr" | "storage" | "model_access"
    current_usage: int
    limit: int
    upgrade_url: str = "/pricing"
