import time
from fastapi import Depends, HTTPException, Request
import redis.asyncio as aioredis

from app.middleware.auth import get_current_user
from app.models.user import User


TIER_LIMITS = {
    "free": 3,
    "lite": 5,
    "standard": 8,
    "pro": 10,
}


async def pro_rate_limit(
    request: Request,
    user: User = Depends(get_current_user),
) -> None:
    """
    Rate limit all users based on subscription tier: 3-10 requests per 60s sliding window.
    Uses Redis sorted sets. Free tier gets most restrictive limit, Pro gets highest.
    """
    # Get tier-based limit (default to free tier limit if tier not found)
    limit = TIER_LIMITS.get(user.tier, 3)

    # Get Redis from app state (initialized in main.py lifespan)
    redis_client: aioredis.Redis = request.app.state.redis
    key = f"rate_limit:pro:{user.id}"
    now = int(time.time())
    window_start = now - 60

    pipe = redis_client.pipeline()
    pipe.zremrangebyscore(key, 0, window_start)
    pipe.zadd(key, {str(__import__("uuid").uuid4()): now})
    pipe.zcard(key)
    pipe.expire(key, 120)
    results = await pipe.execute()

    request_count = results[2]
    if request_count > limit:
        raise HTTPException(
            status_code=429,
            detail="요청 속도 제한 초과. 잠시 후 다시 시도해 주세요.",
            headers={"Retry-After": "60"},
        )
