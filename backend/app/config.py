import os
import socket
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit
from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


BASE_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
    )

    database_url: str = "postgresql+asyncpg://quiz:quiz@localhost:5432/quizmanager"
    database_url_sync: str = "postgresql://quiz:quiz@localhost:5432/quizmanager"
    app_env: str = "development"
    redis_url: str = "redis://localhost:6379/0"

    jwt_secret_key: str = "change-me-to-a-secure-random-string"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 7
    admin_session_expire_minutes: int = 30

    admin_master_password_hash: str = ""

    openai_api_key: str = ""
    openai_generation_model: str = "gpt-4o"
    openai_grading_model: str = "gpt-4o-mini"
    openai_fallback_generation_model: str = "gpt-4o-mini"
    openai_fallback_grading_model: str = "gpt-3.5-turbo"

    upload_dir: str = "./storage/uploads"
    max_upload_size_mb: int = 100
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


settings.database_url = _normalize_database_url(settings.database_url)
settings.database_url_sync = _normalize_database_url(settings.database_url_sync)
