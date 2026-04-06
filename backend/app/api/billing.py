import asyncio
import logging
from datetime import datetime, timezone

import stripe
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
    PortalResponse,
    SubscriptionResponse,
    UsageStatusResponse,
)
from app.services.credit_service import CreditService
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
        ("learner", "monthly"): settings.stripe_learner_monthly_price_id,
        ("learner", "quarterly"): settings.stripe_learner_quarterly_price_id,
        ("pro", "monthly"): settings.stripe_pro_monthly_price_id,
        ("pro", "quarterly"): settings.stripe_pro_quarterly_price_id,
    }
    price_id = price_id_map[(req.plan, req.billing_cycle)]
    if not price_id:
        raise HTTPException(status_code=503, detail="Payment not configured")

    customer_id = await subscription_svc.get_or_create_stripe_customer(db, user)
    session_url = await subscription_svc.create_subscription_checkout(
        customer_id=customer_id,
        price_id=price_id,
        success_url=f"{settings.app_url}/settings/billing?success=1",
        cancel_url=f"{settings.app_url}/pricing",
        metadata={
            "user_id": user.id,
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
    customer_id = await subscription_svc.get_or_create_stripe_customer(db, user)
    try:
        session_url = await credit_svc.create_credit_checkout(
            customer_id=customer_id,
            credit_type=req.credit_type,
            pack_size=req.pack_size,
            success_url=f"{settings.app_url}/settings/billing?success=1",
            cancel_url=f"{settings.app_url}/settings/billing",
            user_id=user.id,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return CheckoutResponse(session_url=session_url)


@router.post("/portal", response_model=PortalResponse)
async def billing_portal(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    customer_id = await subscription_svc.get_or_create_stripe_customer(db, user)
    stripe.api_key = settings.stripe_secret_key
    portal_session = await asyncio.to_thread(
        stripe.billing_portal.Session.create,
        customer=customer_id,
        return_url=f"{settings.app_url}/settings/billing",
    )
    return PortalResponse(portal_url=portal_session["url"])


@router.post("/webhook/stripe", include_in_schema=False)
async def stripe_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Public endpoint — no JWT. Verified via Stripe signature."""
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    try:
        event = await asyncio.to_thread(
            stripe.Webhook.construct_event,
            payload,
            sig_header,
            settings.stripe_webhook_secret,
        )
    except (stripe.error.SignatureVerificationError, ValueError) as e:
        raise HTTPException(status_code=400, detail="Invalid Stripe signature")

    # Idempotency check
    event_id = event["id"]
    existing = await db.execute(
        select(WebhookEvent).where(WebhookEvent.event_id == event_id)
    )
    if existing.scalar_one_or_none():
        return {"status": "already_processed"}

    event_type = event["type"]
    data = event["data"]["object"]

    try:
        if event_type == "checkout.session.completed":
            mode = data.get("mode")
            meta = data.get("metadata", {})
            user_id = meta.get("user_id")

            if mode == "subscription" and user_id:
                # Fetch subscription details from Stripe
                stripe.api_key = settings.stripe_secret_key
                stripe_sub = await asyncio.to_thread(
                    stripe.Subscription.retrieve, data["subscription"]
                )
                period_end = datetime.fromtimestamp(
                    stripe_sub["current_period_end"], tz=timezone.utc
                )
                await subscription_svc.provision_tier(
                    db=db,
                    user_id=user_id,
                    tier=meta.get("plan", "learner"),
                    billing_cycle=meta.get("billing_cycle", "monthly"),
                    stripe_subscription_id=data["subscription"],
                    stripe_customer_id=data["customer"],
                    current_period_end=period_end,
                )

            elif mode == "payment" and user_id:
                storage_bytes = int(meta.get("storage_bytes", 0))
                ai_count = int(meta.get("ai_count", 0))
                await credit_svc.add_credits(
                    db=db,
                    user_id=user_id,
                    storage_bytes=storage_bytes,
                    ai_count=ai_count,
                    stripe_payment_intent_id=data.get("payment_intent"),
                )

        elif event_type in (
            "customer.subscription.updated",
            "customer.subscription.created",
        ):
            # Handle plan changes
            customer_id = data.get("customer")
            status_val = data.get("status")
            if status_val in ("active", "trialing"):
                # Find user by stripe_customer_id
                from app.models.user import User as UserModel

                user_result = await db.execute(
                    select(UserModel).where(UserModel.stripe_customer_id == customer_id)
                )
                db_user = user_result.scalar_one_or_none()
                if db_user:
                    sub_result = await db.execute(
                        select(Subscription).where(
                            Subscription.stripe_subscription_id == data["id"]
                        )
                    )
                    sub = sub_result.scalar_one_or_none()
                    if sub:
                        period_end = datetime.fromtimestamp(
                            data["current_period_end"], tz=timezone.utc
                        )
                        sub.status = status_val
                        sub.current_period_end = period_end
                        await db.commit()

        elif event_type == "customer.subscription.deleted":
            # Find user and downgrade
            customer_id = data.get("customer")
            from app.models.user import User as UserModel

            user_result = await db.execute(
                select(UserModel).where(UserModel.stripe_customer_id == customer_id)
            )
            db_user = user_result.scalar_one_or_none()
            if db_user:
                await subscription_svc.cancel_or_downgrade(db, db_user.id)

        elif event_type == "invoice.payment_failed":
            # Mark subscription as past_due
            customer_id = data.get("customer")
            sub_result = await db.execute(
                select(Subscription).where(
                    Subscription.stripe_customer_id == customer_id
                )
            )
            sub = sub_result.scalar_one_or_none()
            if sub:
                sub.status = "past_due"
                await db.commit()

    except Exception as e:
        logger.error("Webhook processing error for %s: %s", event_id, e)
        # Still record event to prevent retries, but log the error

    # Record processed event (idempotency)
    db.add(WebhookEvent(event_id=event_id, event_type=event_type))
    await db.commit()
    return {"status": "ok"}
