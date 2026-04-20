import time
import uuid

import redis.asyncio as aioredis
from fastapi import Depends, HTTPException, Request

from app.middleware.auth import get_current_user
from app.models.user import User


# Separate from pro_rate_limit (3-10/min) because uploads are cheap I/O
# and abuse is already bounded by storage_quota_bytes + Celery queue depth.
UPLOAD_TIER_LIMITS = {
    "free": 30,
    "lite": 60,
    "standard": 120,
    "pro": 300,
}


async def upload_rate_limit(
    request: Request,
    user: User = Depends(get_current_user),
) -> None:
    """Per-tier sliding-window limit for file uploads (60s window, Redis zset)."""
    limit = UPLOAD_TIER_LIMITS.get(user.tier, UPLOAD_TIER_LIMITS["free"])

    redis_client: aioredis.Redis = request.app.state.redis
    key = f"rate_limit:upload:{user.id}"
    now = int(time.time())
    window_start = now - 60

    pipe = redis_client.pipeline()
    pipe.zremrangebyscore(key, 0, window_start)
    pipe.zadd(key, {str(uuid.uuid4()): now})
    pipe.zcard(key)
    pipe.expire(key, 120)
    results = await pipe.execute()

    request_count = results[2]
    if request_count > limit:
        raise HTTPException(
            status_code=429,
            detail="업로드 속도 제한 초과. 잠시 후 다시 시도해 주세요.",
            headers={"Retry-After": "60"},
        )
