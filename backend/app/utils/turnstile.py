import logging

import httpx
from fastapi import HTTPException

from app.config import settings

logger = logging.getLogger(__name__)

TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"


async def verify_turnstile_token(token: str, client_ip: str) -> bool:
    """Verify a Cloudflare Turnstile token.

    Returns True if verification passes, False if it fails.
    Raises HTTPException(503) if Cloudflare is unreachable (fail closed).
    If the secret key is not configured (empty), returns True (dev bypass).
    """
    if not settings.cloudflare_turnstile_secret_key:
        return True

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.post(
                TURNSTILE_VERIFY_URL,
                data={
                    "secret": settings.cloudflare_turnstile_secret_key,
                    "response": token,
                    "remoteip": client_ip,
                },
            )
            result = response.json()
    except (
        httpx.TimeoutException,
        httpx.ConnectError,
        httpx.HTTPError,
        ValueError,
    ) as exc:
        logger.error("Turnstile verification request failed: %s", exc)
        raise HTTPException(
            status_code=503,
            detail="보안 인증 서비스에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.",
        )

    if result.get("success"):
        return True

    error_codes = result.get("error-codes", [])
    logger.warning("Turnstile verification failed: %s", error_codes)
    return False
