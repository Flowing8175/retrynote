import hashlib
import hmac
import logging
from datetime import datetime
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


class PaddleError(Exception):
    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail
        super().__init__(f"Paddle API error {status_code}: {detail}")


def _parse_paddle_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


class PaddleClient:
    @property
    def _base_url(self) -> str:
        if settings.paddle_environment == "production":
            return "https://api.paddle.com"
        return "https://sandbox-api.paddle.com"

    @property
    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {settings.paddle_api_key}",
            "Content-Type": "application/json",
        }

    async def _request(self, method: str, path: str, body: dict | None = None) -> Any:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.request(
                method,
                f"{self._base_url}{path}",
                json=body,
                headers=self._headers,
            )
        if not resp.is_success:
            logger.error(
                "Paddle %s %s → %d: %s", method, path, resp.status_code, resp.text
            )
            raise PaddleError(resp.status_code, resp.text)
        return resp.json().get("data", {})

    async def create_customer(self, email: str, custom_data: dict) -> dict:
        return await self._request(
            "POST",
            "/customers",
            {"email": email, "custom_data": custom_data},
        )

    async def create_transaction(
        self,
        customer_id: str,
        price_id: str,
        custom_data: dict,
        success_url: str,
    ) -> dict:
        return await self._request(
            "POST",
            "/transactions",
            {
                "items": [{"price_id": price_id, "quantity": 1}],
                "customer_id": customer_id,
                "custom_data": custom_data,
                "checkout": {"url": success_url},
            },
        )

    async def get_subscription(self, subscription_id: str) -> dict:
        return await self._request("GET", f"/subscriptions/{subscription_id}")

    async def cancel_subscription(self, subscription_id: str) -> dict:
        return await self._request(
            "POST",
            f"/subscriptions/{subscription_id}/cancel",
            {"effective_from": "next_billing_period"},
        )

    @staticmethod
    def verify_webhook(raw_body: bytes, signature: str, secret: str) -> bool:
        try:
            parts = dict(item.split("=", 1) for item in signature.split(";"))
            ts = parts["ts"]
            h1 = parts["h1"]
        except (ValueError, KeyError):
            return False
        signed_payload = f"{ts}:{raw_body.decode('utf-8')}"
        expected = hmac.new(
            secret.encode("utf-8"),
            signed_payload.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(h1, expected)


paddle = PaddleClient()
parse_paddle_datetime = _parse_paddle_datetime
