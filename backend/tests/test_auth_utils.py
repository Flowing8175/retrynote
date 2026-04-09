from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

from app.middleware.auth import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    create_admin_token,
    get_client_ip,
)
import jwt
from app.config import settings


class TestHashPassword:
    def test_returns_string(self):
        result = hash_password("password123")
        assert isinstance(result, str)

    def test_different_inputs_different_hashes(self):
        h1 = hash_password("password1")
        h2 = hash_password("password2")
        assert h1 != h2

    def test_same_input_consistent(self):
        h1 = hash_password("same_password")
        h2 = hash_password("same_password")
        assert h1 != h2
        assert verify_password("same_password", h1)
        assert verify_password("same_password", h2)

    def test_empty_string(self):
        result = hash_password("")
        assert isinstance(result, str)
        assert len(result) > 0


class TestVerifyPassword:
    def test_correct_password(self):
        hashed = hash_password("correct_password")
        assert verify_password("correct_password", hashed) is True

    def test_wrong_password(self):
        hashed = hash_password("correct_password")
        assert verify_password("wrong_password", hashed) is False

    def test_empty_password(self):
        hashed = hash_password("")
        assert verify_password("", hashed) is True
        assert verify_password("not_empty", hashed) is False


class TestCreateAccessToken:
    def test_returns_jwt_string(self):
        token = create_access_token("user-123", "user")
        assert isinstance(token, str)
        parts = token.split(".")
        assert len(parts) == 3

    def test_contains_correct_claims(self):
        token = create_access_token("user-456", "admin")
        payload = jwt.decode(
            token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm]
        )
        assert payload["sub"] == "user-456"
        assert payload["role"] == "admin"
        assert payload["type"] == "access"

    def test_custom_expiry(self):
        token = create_access_token(
            "user-789", "user", expires_delta=timedelta(minutes=5)
        )
        payload = jwt.decode(
            token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm]
        )
        exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
        now = datetime.now(timezone.utc)
        assert exp > now
        assert exp < now + timedelta(minutes=10)

    def test_default_expiry(self):
        token = create_access_token("user-001", "user")
        payload = jwt.decode(
            token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm]
        )
        exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
        now = datetime.now(timezone.utc)
        assert exp > now
        assert exp <= now + timedelta(minutes=settings.access_token_expire_minutes + 1)


class TestCreateRefreshToken:
    def test_returns_jwt_string(self):
        token = create_refresh_token("user-123", "user")
        assert isinstance(token, str)
        parts = token.split(".")
        assert len(parts) == 3

    def test_contains_correct_claims(self):
        token = create_refresh_token("user-456", "admin")
        payload = jwt.decode(
            token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm]
        )
        assert payload["sub"] == "user-456"
        assert payload["role"] == "admin"
        assert payload["type"] == "refresh"

    def test_longer_expiry_than_access(self):
        access = create_access_token("user-789", "user")
        refresh = create_refresh_token("user-789", "user")
        access_payload = jwt.decode(
            access, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm]
        )
        refresh_payload = jwt.decode(
            refresh, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm]
        )
        assert refresh_payload["exp"] > access_payload["exp"]


class TestCreateAdminToken:
    def test_returns_jwt_string(self):
        token = create_admin_token("admin-123")
        assert isinstance(token, str)

    def test_contains_admin_verified_role(self):
        token = create_admin_token("admin-123")
        payload = jwt.decode(
            token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm]
        )
        assert payload["sub"] == "admin-123"
        assert payload["role"] == "admin_verified"
        assert payload["type"] == "admin"

    def test_shorter_expiry_than_access(self):
        admin_token = create_admin_token("admin-123")
        access_token = create_access_token("admin-123", "admin")
        admin_payload = jwt.decode(
            admin_token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm]
        )
        access_payload = jwt.decode(
            access_token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm]
        )
        assert admin_payload["exp"] <= access_payload["exp"]


class TestGetClientIp:
    def test_with_forwarded_header(self):
        request = MagicMock()
        request.headers = {"X-Forwarded-For": "1.2.3.4, 5.6.7.8"}
        assert get_client_ip(request) == "1.2.3.4"

    def test_with_single_forwarded(self):
        request = MagicMock()
        request.headers = {"X-Forwarded-For": "10.0.0.1"}
        assert get_client_ip(request) == "10.0.0.1"

    def test_without_forwarded_header(self):
        request = MagicMock()
        request.headers = {}
        request.client.host = "192.168.1.1"
        assert get_client_ip(request) == "192.168.1.1"

    def test_no_client_info(self):
        request = MagicMock()
        request.headers = {}
        request.client = None
        assert get_client_ip(request) == "unknown"

    def test_forwarded_with_spaces(self):
        request = MagicMock()
        request.headers = {"X-Forwarded-For": "  1.2.3.4  , 5.6.7.8"}
        assert get_client_ip(request) == "1.2.3.4"
