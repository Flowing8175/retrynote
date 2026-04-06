import json
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.billing import WebhookEvent, Subscription
from app.models.user import User
from app.schemas.billing import (
    CheckoutRequest,
    CheckoutResponse,
    CreditCheckoutRequest,
    ManageUrlsResponse,
    SubscriptionResponse,
    UsageStatusResponse,
)
from app.services.credit_service import CreditService
from app.services.paddle_client import paddle, PaddleError, parse_paddle_datetime
from app.services.subscription_service import SubscriptionService
from app.services.usage_service import UsageService

router = APIRouter()
logger = logging.getLogger(__name__)

subscription_svc = SubscriptionService()
credit_svc = CreditService()
usage_svc = UsageService()


@router.get("/usage", response_model=UsageStatusResponse)
async def get_usage_status(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await usage_svc.get_usage_status(db, user)


@router.get("/subscription", response_model=SubscriptionResponse | None)
async def get_subscription(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await subscription_svc.get_current(db, user.id)


@router.post("/checkout/subscription", response_model=CheckoutResponse)
async def checkout_subscription(
    req: CheckoutRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if req.plan not in ("learner", "pro"):
        raise HTTPException(status_code=422, detail="Invalid plan")
    if req.billing_cycle not in ("monthly", "quarterly"):
        raise HTTPException(status_code=422, detail="Invalid billing_cycle")

    price_id_map = {
        ("learner", "monthly"): settings.paddle_learner_monthly_price_id,
        ("learner", "quarterly"): settings.paddle_learner_quarterly_price_id,
        ("pro", "monthly"): settings.paddle_pro_monthly_price_id,
        ("pro", "quarterly"): settings.paddle_pro_quarterly_price_id,
    }
    price_id = price_id_map[(req.plan, req.billing_cycle)]
    if not price_id:
        raise HTTPException(status_code=503, detail="Payment not configured")

    customer_id = await subscription_svc.get_or_create_paddle_customer(db, user)
    session_url = await subscription_svc.create_subscription_checkout(
        customer_id=customer_id,
        price_id=price_id,
        success_url=f"{settings.app_url}/settings/billing?success=1",
        metadata={
            "user_id": str(user.id),
            "plan": req.plan,
            "billing_cycle": req.billing_cycle,
        },
    )
    return CheckoutResponse(session_url=session_url)


@router.post("/checkout/credits", response_model=CheckoutResponse)
async def checkout_credits(
    req: CreditCheckoutRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    customer_id = await subscription_svc.get_or_create_paddle_customer(db, user)
    try:
        session_url = await credit_svc.create_credit_checkout(
            customer_id=customer_id,
            credit_type=req.credit_type,
            pack_size=req.pack_size,
            success_url=f"{settings.app_url}/settings/billing?success=1",
            user_id=str(user.id),
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return CheckoutResponse(session_url=session_url)


@router.get("/manage-urls", response_model=ManageUrlsResponse)
async def get_manage_urls(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    sub = await subscription_svc.get_current(db, user.id)
    if not sub or not sub.paddle_subscription_id:
        return ManageUrlsResponse(update_payment_method_url=None, cancel_url=None)
    try:
        paddle_sub = await paddle.get_subscription(sub.paddle_subscription_id)
        mgmt = paddle_sub.get("management_urls") or {}
        return ManageUrlsResponse(
            update_payment_method_url=mgmt.get("update_payment_method"),
            cancel_url=mgmt.get("cancel"),
        )
    except PaddleError as e:
        logger.error("Paddle get_subscription failed: %s", e)
        return ManageUrlsResponse(update_payment_method_url=None, cancel_url=None)


@router.post("/cancel", status_code=status.HTTP_200_OK)
async def cancel_subscription(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    sub = await subscription_svc.get_current(db, user.id)
    if not sub or not sub.paddle_subscription_id:
        raise HTTPException(status_code=404, detail="No active subscription found")
    try:
        await paddle.cancel_subscription(sub.paddle_subscription_id)
    except PaddleError as e:
        logger.error("Paddle cancel_subscription failed: %s", e)
        raise HTTPException(status_code=502, detail="Failed to cancel subscription")
    return {"status": "cancellation_scheduled"}


@router.post("/webhook/paddle", include_in_schema=False)
async def paddle_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    payload = await request.body()
    sig_header = request.headers.get("Paddle-Signature", "")

    if not paddle.verify_webhook(payload, sig_header, settings.paddle_webhook_secret):
        raise HTTPException(status_code=400, detail="Invalid Paddle signature")

    try:
        event = json.loads(payload)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    notification_id = event.get("notification_id", "")
    event_type = event.get("event_type", "")
    data = event.get("data") or {}

    if notification_id:
        existing = await db.execute(
            select(WebhookEvent).where(WebhookEvent.event_id == notification_id)
        )
        if existing.scalar_one_or_none():
            return {"status": "already_processed"}

    try:
        if event_type in ("subscription.created", "subscription.activated"):
            custom_data = data.get("custom_data") or {}
            user_id = custom_data.get("user_id")
            sub_status = data.get("status", "")

            if user_id and sub_status in ("active", "trialing"):
                await subscription_svc.provision_tier(
                    db=db,
                    user_id=user_id,
                    tier=custom_data.get("plan", "learner"),
                    billing_cycle=custom_data.get("billing_cycle", "monthly"),
                    paddle_subscription_id=data["id"],
                    paddle_customer_id=data["customer_id"],
                    current_period_end=parse_paddle_datetime(
                        data.get("next_billed_at")
                    ),
                )

        elif event_type == "subscription.updated":
            sub_id = data.get("id")
            if sub_id:
                sub_result = await db.execute(
                    select(Subscription).where(
                        Subscription.paddle_subscription_id == sub_id
                    )
                )
                sub = sub_result.scalar_one_or_none()
                if sub:
                    sub.status = data.get("status", sub.status)
                    period_end = parse_paddle_datetime(data.get("next_billed_at"))
                    if period_end:
                        sub.current_period_end = period_end
                    await db.commit()

        elif event_type == "subscription.canceled":
            customer_id = data.get("customer_id")
            if customer_id:
                user_result = await db.execute(
                    select(User).where(User.paddle_customer_id == customer_id)
                )
                db_user = user_result.scalar_one_or_none()
                if db_user:
                    await subscription_svc.cancel_or_downgrade(db, db_user.id)

        elif event_type == "transaction.completed":
            subscription_id = data.get("subscription_id")
            custom_data = data.get("custom_data") or {}
            user_id = custom_data.get("user_id")

            if not subscription_id and user_id and custom_data.get("credit_type"):
                await credit_svc.add_credits(
                    db=db,
                    user_id=user_id,
                    storage_bytes=int(custom_data.get("storage_bytes", 0)),
                    ai_count=int(custom_data.get("ai_count", 0)),
                    paddle_transaction_id=data.get("id"),
                )

    except Exception as e:
        logger.error("Webhook processing error for %s: %s", notification_id, e)

    if notification_id:
        db.add(WebhookEvent(event_id=notification_id, event_type=event_type))
        await db.commit()

    return {"status": "ok"}
