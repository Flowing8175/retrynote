import logging
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit
from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache

logger = logging.getLogger(__name__)


BASE_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = "postgresql+asyncpg://quiz:quiz@localhost:5432/quizmanager"
    database_url_sync: str = "postgresql://quiz:quiz@localhost:5432/quizmanager"
    app_env: str = "development"
    redis_url: str = "redis://localhost:6379/0"
    redis_password: str = ""

    jwt_secret_key: str = "change-me-to-a-secure-random-string"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 7
    admin_session_expire_minutes: int = 30

    admin_master_password: str = ""

    openai_api_key: str = ""

    gemini_api_key: str = ""

    # Provider-agnostic model tiers — set to any model string; provider is
    # auto-detected from the model name prefix (e.g. "gemini-" → Gemini API).
    eco_generation_model: str = "gpt-5.4-nano"
    balanced_generation_model: str = "gpt-5.4-mini"
    performance_generation_model: str = "gemini-3-flash"

    gemini_context_cache_enabled: bool = True
    gemini_context_cache_ttl_seconds: int = 3600

    upload_dir: str = "storage/uploads"
    max_upload_size_mb: int = 5
    allowed_file_types: str = "pdf,docx,pptx,txt,md,png,jpg,jpeg"

    app_url: str = "http://localhost:5173"
    api_url: str = "http://localhost:8000"
    cors_origins: str = "http://localhost:5173"

    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "noreply@example.com"

    generation_timeout: int = 120
    grading_timeout: int = 60
    objection_review_timeout: int = 90
    file_processing_timeout: int = 300

    max_retry_count: int = 3
    daily_quiz_generation_limit: int = 50
    daily_ocr_page_limit: int = 100

    # Backblaze B2
    b2_key_id: str = ""
    b2_application_key: str = ""
    b2_bucket_name: str = ""
    b2_endpoint_url: str = ""

    # Google Cloud Vision OCR
    google_vision_api_key: str = ""

    paddle_api_key: str = ""
    paddle_client_token: str = ""
    paddle_environment: str = "sandbox"
    paddle_webhook_secret: str = ""
    paddle_lite_monthly_price_id: str = ""
    paddle_lite_quarterly_price_id: str = ""
    paddle_standard_monthly_price_id: str = ""
    paddle_standard_quarterly_price_id: str = ""
    paddle_pro_monthly_price_id: str = ""
    paddle_pro_quarterly_price_id: str = ""
    paddle_storage_5gb_price_id: str = ""
    paddle_storage_20gb_price_id: str = ""
    paddle_storage_50gb_price_id: str = ""

    # Cloudflare Turnstile — production keys must be set via Doppler
    # Development test key: 1x0000000000000000000000000000000AA (always passes)
    cloudflare_turnstile_secret_key: str = ""

    GUEST_SESSION_TTL_HOURS: int = 24


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()


def _normalize_database_url(database_url: str) -> str:
    parsed = urlsplit(database_url)
    in_docker = Path("/.dockerenv").exists()

    if in_docker and parsed.hostname in {"localhost", "127.0.0.1"}:
        target_host = "db"
    elif not in_docker and parsed.hostname == "db":
        target_host = "localhost"
    else:
        return database_url

    auth = ""
    if parsed.username:
        auth = parsed.username
        if parsed.password:
            auth += f":{parsed.password}"
        auth += "@"

    port = f":{parsed.port}" if parsed.port else ""
    netloc = f"{auth}{target_host}{port}"
    return urlunsplit(
        (parsed.scheme, netloc, parsed.path, parsed.query, parsed.fragment)
    )


def _normalize_redis_url(redis_url: str) -> str:
    parsed = urlsplit(redis_url)
    in_docker = Path("/.dockerenv").exists()

    if in_docker and parsed.hostname in {"localhost", "127.0.0.1"}:
        target_host = "redis"
    elif not in_docker and parsed.hostname == "redis":
        target_host = "localhost"
    else:
        return redis_url

    auth = ""
    if parsed.username:
        auth = parsed.username
        if parsed.password:
            auth += f":{parsed.password}"
        auth += "@"

    port = f":{parsed.port}" if parsed.port else ""
    netloc = f"{auth}{target_host}{port}"
    return urlunsplit(
        (parsed.scheme, netloc, parsed.path, parsed.query, parsed.fragment)
    )


settings.database_url = _normalize_database_url(settings.database_url)
settings.database_url_sync = _normalize_database_url(settings.database_url_sync)
settings.redis_url = _normalize_redis_url(settings.redis_url)

if settings.b2_endpoint_url and not settings.b2_endpoint_url.startswith(
    ("http://", "https://")
):
    settings.b2_endpoint_url = f"https://{settings.b2_endpoint_url}"

_INSECURE_JWT_DEFAULTS = {
    "change-me-to-a-secure-random-string",
    "randonshit0987",
}

if settings.app_env != "development":
    if (
        settings.jwt_secret_key in _INSECURE_JWT_DEFAULTS
        or len(settings.jwt_secret_key) < 32
    ):
        raise RuntimeError(
            "JWT_SECRET_KEY is insecure. Use a random string of at least 32 characters "
            "in non-development environments."
        )
else:
    if (
        settings.jwt_secret_key in _INSECURE_JWT_DEFAULTS
        or len(settings.jwt_secret_key) < 32
    ):
        logger.warning(
            "JWT_SECRET_KEY is insecure. This is acceptable in development but MUST be "
            "changed before deploying to production."
        )

if settings.app_env != "development":
    if not settings.paddle_webhook_secret or len(settings.paddle_webhook_secret) < 16:
        raise RuntimeError(
            "PADDLE_WEBHOOK_SECRET must be set and at least 16 characters long "
            "in non-development environments."
        )
else:
    if not settings.paddle_webhook_secret:
        logger.warning(
            "PADDLE_WEBHOOK_SECRET is not set. Paddle webhook signature verification "
            "is disabled. Do not deploy without setting this."
        )

if (
    settings.paddle_api_key
    and "_live_" in settings.paddle_api_key
    and settings.paddle_environment == "sandbox"
):
    logger.warning(
        "PADDLE_API_KEY appears to be a live key but PADDLE_ENVIRONMENT=sandbox. "
        "This may cause billing inconsistencies. Set PADDLE_ENVIRONMENT=production for live keys."
    )
