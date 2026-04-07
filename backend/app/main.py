from app.config import settings

app_metadata = {
    "title": "RetryNote API",
    "version": "1.0.0",
}

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from app.rate_limit import limiter, _get_real_client_ip
from slowapi.errors import RateLimitExceeded
import redis.asyncio as aioredis
import uuid
import asyncio
from app.database import async_session
from app.models.admin import SystemLog


async def _log_rate_limit_event(request: Request, user_id: str | None = None):
    """Fire-and-forget background task to log rate limit event."""
    try:
        async with async_session() as db:
            client_ip = _get_real_client_ip(request)
            log = SystemLog(
                id=str(uuid.uuid4()),
                level="WARNING",
                service_name="rate_limiter",
                event_type="rate_limit_exceeded",
                message=f"Rate limit exceeded: {request.method} {request.url.path}",
                meta_json={
                    "user_id": user_id,
                    "path": str(request.url.path),
                    "method": request.method,
                    "client_ip": client_ip,
                },
            )
            db.add(log)
            await db.commit()
    except Exception:
        # Silently fail - don't let logging errors affect the response
        pass


async def _rate_limit_exceeded_handler(request: Request, exc: Exception):
    """Custom rate limit handler that logs to SystemLog."""
    # Extract user_id from JWT token if present
    user_id = None
    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        try:
            import jwt as _jwt

            token = auth_header[7:]
            payload = _jwt.decode(
                token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm]
            )
            user_id = payload.get("sub")
        except Exception:
            # Token is invalid or expired, user_id stays None
            pass

    # Fire-and-forget background logging
    asyncio.create_task(_log_rate_limit_event(request, user_id))

    # Return 429 response
    return JSONResponse(
        status_code=429,
        content={"detail": "Rate limit exceeded"},
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.redis = aioredis.from_url(settings.redis_url, decode_responses=False)
    yield
    await app.state.redis.aclose()


app = FastAPI(
    title=app_metadata["title"], version=app_metadata["version"], lifespan=lifespan
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if request.url.scheme == "https":
        response.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains"
        )
    return response


from app.api import (
    auth,
    files,
    quiz,
    objections,
    wrong_notes,
    retry,
    dashboard,
    search,
    admin,
)
from app.api.billing import router as billing_router

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(files.router, prefix="/files", tags=["files"])
app.include_router(quiz.router, prefix="/quiz-sessions", tags=["quiz-sessions"])
app.include_router(objections.router, prefix="/objections", tags=["objections"])
app.include_router(wrong_notes.router, prefix="/wrong-notes", tags=["wrong-notes"])
app.include_router(retry.router, prefix="/retry-sets", tags=["retry-sets"])
app.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])
app.include_router(search.router, prefix="/search", tags=["search"])
app.include_router(admin.router, prefix="/admin", tags=["admin"])
app.include_router(billing_router, prefix="/billing", tags=["billing"])


@app.get("/health")
async def health():
    return {"status": "ok"}
