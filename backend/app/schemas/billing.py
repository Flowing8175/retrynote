from datetime import datetime
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class _CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


class UsageWindowSchema(_CamelModel):
    resource_type: str
    consumed: int
    limit: int
    window_starts_at: datetime
    window_ends_at: datetime
    source: str


class CreditBalanceSchema(_CamelModel):
    storage_credits_bytes: int


class UsageStatusResponse(_CamelModel):
    tier: str
    windows: list[UsageWindowSchema]
    credits: CreditBalanceSchema
    free_trial_used_at: datetime | None
    free_trial_available: bool


class SubscriptionResponse(_CamelModel):
    id: str
    tier: str
    billing_cycle: str
    status: str
    current_period_end: datetime | None


class CheckoutRequest(BaseModel):
    plan: str
    billing_cycle: str


class CreditCheckoutRequest(BaseModel):
    credit_type: str
    pack_size: str


class CheckoutResponse(_CamelModel):
    session_url: str


class ManageUrlsResponse(_CamelModel):
    update_payment_method_url: str | None
    cancel_url: str | None


class LimitExceededError(_CamelModel):
    detail: str
    limit_type: str
    current_usage: int
    limit: int
    upgrade_url: str = "/pricing"
