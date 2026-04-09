import time
import uuid

import redis.asyncio as aioredis
from fastapi import HTTPException, Request


async def guest_ip_rate_limit(request: Request) -> None:
    redis_client: aioredis.Redis = request.app.state.redis

    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()
    else:
        client_ip = request.client.host if request.client else "unknown"

    now = int(time.time())
    window_start = now - 86400
    key = f"guest_rate:{client_ip}"

    pipe = redis_client.pipeline()
    pipe.zremrangebyscore(key, 0, window_start)
    pipe.zadd(key, {str(uuid.uuid4()): now})
    pipe.zcard(key)
    pipe.expire(key, 86400)
    results = await pipe.execute()

    request_count = results[2]
    if request_count > 3:
        raise HTTPException(
            status_code=429,
            detail="일일 무료 체험 횟수를 초과했습니다. 가입하면 더 많은 퀴즈를 만들 수 있습니다.",
            headers={"Retry-After": "86400"},
        )
