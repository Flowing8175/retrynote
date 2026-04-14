import asyncio
import json
from typing import Any, AsyncGenerator

from fastapi import Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
import jwt as _jwt
from jwt import InvalidTokenError as JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.user import User

HEARTBEAT_INTERVAL_SECS = 30


async def _with_heartbeat(
    source: AsyncGenerator[str, None],
) -> AsyncGenerator[str, None]:
    it = source.__aiter__()
    while True:
        try:
            chunk = await asyncio.wait_for(
                it.__anext__(), timeout=HEARTBEAT_INTERVAL_SECS
            )
            yield chunk
        except asyncio.TimeoutError:
            yield ": keepalive\n\n"
        except StopAsyncIteration:
            break


def sse_stream(generator: AsyncGenerator[str, None]) -> StreamingResponse:
    return StreamingResponse(
        _with_heartbeat(generator),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


def sse_data(payload: Any) -> str:
    return f"data: {json.dumps(payload)}\n\n"


def sse_error(message: str) -> str:
    return f"event: error\ndata: {json.dumps({'message': message})}\n\n"


def sse_done() -> str:
    return "event: done\ndata: {}\n\n"


async def get_current_user_from_query_token(
    token: str = Query(...),
    db: AsyncSession = Depends(get_db),
) -> User:
    """JWT auth for SSE endpoints — EventSource cannot set Authorization headers,
    so the access token is passed as a query parameter instead."""
    try:
        payload = _jwt.decode(
            token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm]
        )
        user_id = payload.get("sub")
        token_type = payload.get("type")
        if not isinstance(user_id, str) or token_type != "access":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
            )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
        )

    result = await db.execute(
        select(User).where(User.id == user_id, User.deleted_at.is_(None))
    )
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )
    return user
