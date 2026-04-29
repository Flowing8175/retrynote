import logging
import time
from datetime import datetime, timezone
from typing import Any

from dateutil.relativedelta import relativedelta
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.billing import AICreditBatch, CreditBalance, CreditPurchase
from app.config import settings
from app.services.paddle_client import paddle, PaddleError
from app.utils.db_helpers import get_or_create_credit_balance

logger = logging.getLogger(__name__)

# In-memory price cache: {price_id: (fetched_at, price_data)}
_price_cache: dict[str, tuple[float, dict[str, Any]]] = {}
_PRICE_CACHE_TTL = 3600

CREDIT_PACKS = {
    ("storage", "5gb"): {
        "price_id_setting": "paddle_storage_5gb_price_id",
        "storage_bytes": 5 * 1024 * 1024 * 1024,
    },
    ("storage", "20gb"): {
        "price_id_setting": "paddle_storage_20gb_price_id",
        "storage_bytes": 20 * 1024 * 1024 * 1024,
    },
    ("storage", "50gb"): {
        "price_id_setting": "paddle_storage_50gb_price_id",
        "storage_bytes": 50 * 1024 * 1024 * 1024,
    },
    ("ai", "50"): {"price_id_setting": "paddle_ai_50_price_id", "ai_count": 50},
    ("ai", "200"): {"price_id_setting": "paddle_ai_200_price_id", "ai_count": 200},
    ("ai", "500"): {"price_id_setting": "paddle_ai_500_price_id", "ai_count": 500},
}

VALID_AI_PACK_SIZES = {"50", "200", "500"}


class CreditService:
    async def get_balance(self, db: AsyncSession, user_id: str) -> CreditBalance:
        return await get_or_create_credit_balance(db, user_id)

    async def add_credits(
        self,
        db: AsyncSession,
        user_id: str,
        storage_bytes: int = 0,
        ai_count: int = 0,
        paddle_transaction_id: str | None = None,
    ) -> CreditBalance:
        balance = await self.get_balance(db, user_id)
        balance.storage_credits_bytes += storage_bytes

        if storage_bytes > 0:
            db.add(
                CreditPurchase(
                    user_id=user_id,
                    credit_type="storage",
                    amount=storage_bytes,
                    paddle_transaction_id=paddle_transaction_id,
                )
            )

        if ai_count > 0:
            now = datetime.now(timezone.utc)
            expires_at = now + relativedelta(months=3)
            batch = AICreditBatch(
                user_id=user_id,
                amount_total=float(ai_count),
                amount_remaining=float(ai_count),
                purchased_at=now,
                expires_at=expires_at,
                paddle_transaction_id=paddle_transaction_id,
            )
            db.add(batch)
            db.add(
                CreditPurchase(
                    user_id=user_id,
                    credit_type="ai",
                    amount=ai_count,
                    paddle_transaction_id=paddle_transaction_id,
                )
            )

        await db.commit()
        await db.refresh(balance)
        return balance

    async def consume_credits(
        self,
        db: AsyncSession,
        user_id: str,
        amount: int,
    ) -> bool:
        # Atomic check-and-decrement: a single UPDATE...WHERE clause guarantees
        # at most one concurrent request can consume credits a user has,
        # eliminating the read-modify-write race that lets parallel requests
        # double-spend a single credit balance. rowcount == 0 means another
        # transaction already consumed those credits OR the balance was
        # insufficient — both should fail-closed.
        if amount <= 0:
            return True

        await self.get_balance(db, user_id)

        result = await db.execute(
            update(CreditBalance)
            .where(
                CreditBalance.user_id == user_id,
                CreditBalance.storage_credits_bytes >= amount,
            )
            .values(
                storage_credits_bytes=CreditBalance.storage_credits_bytes - amount,
            )
        )
        await db.commit()
        return (result.rowcount or 0) > 0  # type: ignore[attr-defined]

    async def _fetch_price(self, price_id: str) -> dict[str, Any]:
        now = time.time()
        cached = _price_cache.get(price_id)
        if cached and (now - cached[0]) < _PRICE_CACHE_TTL:
            return cached[1]
        try:
            data = await paddle.get_price(price_id)
            _price_cache[price_id] = (now, data)
            return data
        except PaddleError:
            if cached:
                return cached[1]
            raise

    async def get_all_credit_packs(self) -> dict[str, list[dict[str, Any]]]:
        result: dict[str, list[dict[str, Any]]] = {"storage": [], "ai": []}

        pack_meta = {
            ("storage", "5gb"): {"label": "+5GB 저장공간", "unit_divisor": 5, "unit_suffix": "/GB"},
            ("storage", "20gb"): {"label": "+20GB 저장공간", "unit_divisor": 20, "unit_suffix": "/GB", "popular": True},
            ("storage", "50gb"): {"label": "+50GB 저장공간", "unit_divisor": 50, "unit_suffix": "/GB"},
            ("ai", "50"): {"label": "+50 AI 크레딧", "unit_divisor": 50, "unit_suffix": ""},
            ("ai", "200"): {"label": "+200 AI 크레딧", "unit_divisor": 200, "unit_suffix": "", "popular": True},
            ("ai", "500"): {"label": "+500 AI 크레딧", "unit_divisor": 500, "unit_suffix": ""},
        }

        for (credit_type, pack_size), pack_def in CREDIT_PACKS.items():
            price_id = getattr(settings, pack_def["price_id_setting"], "")
            if not price_id:
                continue

            try:
                price_data = await self._fetch_price(price_id)
            except PaddleError:
                logger.warning("Failed to fetch price for %s/%s", credit_type, pack_size)
                continue

            unit_price_obj = price_data.get("unit_price", {})
            amount_raw = int(unit_price_obj.get("amount", "0"))
            currency = unit_price_obj.get("currency_code", "KRW")

            meta = pack_meta.get((credit_type, pack_size), {})
            divisor = meta.get("unit_divisor", 1)
            unit_suffix = meta.get("unit_suffix", "")

            if currency == "KRW":
                formatted = f"₩{amount_raw:,}"
                per_unit = amount_raw / divisor if divisor else amount_raw
                if per_unit == int(per_unit):
                    unit_price_str = f"₩{int(per_unit):,}{unit_suffix}"
                else:
                    unit_price_str = f"₩{per_unit:,.1f}{unit_suffix}"
            else:
                formatted = f"{amount_raw / 100:.2f} {currency}"
                per_unit = (amount_raw / 100) / divisor if divisor else amount_raw / 100
                unit_price_str = f"{per_unit:.2f} {currency}{unit_suffix}"

            pack_info = {
                "credit_type": credit_type,
                "pack_size": pack_size,
                "label": meta.get("label", f"{credit_type}/{pack_size}"),
                "price": formatted,
                "unit_price": unit_price_str,
                "currency_code": currency,
                "amount_raw": amount_raw,
                "popular": meta.get("popular", False),
            }
            result[credit_type].append(pack_info)

        return result

    def get_credit_pack_price_id(self, credit_type: str, pack_size: str) -> str:
        key = (credit_type, pack_size)
        pack = CREDIT_PACKS.get(key)
        if pack is None:
            raise ValueError(f"Unknown credit pack: {credit_type}/{pack_size}")
        price_id = getattr(settings, pack["price_id_setting"], "")
        return price_id

    def get_pack_amounts(self, credit_type: str, pack_size: str) -> int:
        key = (credit_type, pack_size)
        pack = CREDIT_PACKS.get(key)
        if pack is None:
            raise ValueError(f"Unknown credit pack: {credit_type}/{pack_size}")
        return pack["storage_bytes"]

    async def create_credit_checkout(
        self,
        customer_id: str,
        credit_type: str,
        pack_size: str,
        success_url: str,
        user_id: str,
    ) -> str:
        price_id = self.get_credit_pack_price_id(credit_type, pack_size)
        key = (credit_type, pack_size)
        pack = CREDIT_PACKS.get(key)
        if pack is None:
            raise ValueError(f"Unknown credit pack: {credit_type}/{pack_size}")

        custom_data = {
            "user_id": user_id,
            "credit_type": credit_type,
            "pack_size": pack_size,
        }

        if credit_type == "storage":
            custom_data["storage_bytes"] = str(pack["storage_bytes"])
        elif credit_type == "ai":
            custom_data["ai_count"] = str(pack["ai_count"])
        else:
            raise ValueError(f"Unknown credit_type: {credit_type}")

        transaction = await paddle.create_transaction(
            customer_id=customer_id,
            price_id=price_id,
            custom_data=custom_data,
            success_url=success_url,
        )
        txn_id = transaction.get("id", "")
        if not txn_id:
            raise ValueError("Paddle returned a transaction without an id")
        return txn_id
