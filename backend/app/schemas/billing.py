from datetime import datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field
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


class SubscriptionResponse(_CamelModel):
    id: str
    tier: str
    billing_cycle: str
    status: str
    current_period_end: datetime | None


class CheckoutRequest(BaseModel):
    plan: Literal["lite", "standard", "pro"]
    billing_cycle: Literal["monthly", "quarterly"]


class CreditCheckoutRequest(BaseModel):
    credit_type: Literal["storage", "ai"]
    pack_size: str = Field(max_length=20)


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
