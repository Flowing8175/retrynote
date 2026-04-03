import uuid
from unittest.mock import AsyncMock, patch

from sqlalchemy.orm import DeclarativeBase

from app.database import Base, CommonMixin, get_db


class TestBase:
    async def test_base_is_declarative_base(self):
        assert issubclass(Base, DeclarativeBase)


class TestCommonMixin:
    async def test_id_default_generates_uuid_string(self):
        id_attr = CommonMixin.__dict__["id"]
        default_fn = id_attr.column.default.arg
        result = default_fn(None)
        parsed = uuid.UUID(result)
        assert isinstance(result, str)
        assert str(parsed) == result

    async def test_id_default_generates_unique_values(self):
        id_attr = CommonMixin.__dict__["id"]
        default_fn = id_attr.column.default.arg
        results = {default_fn(None) for _ in range(10)}
        assert len(results) == 10

    async def test_deleted_at_is_nullable(self):
        deleted_at_attr = CommonMixin.__dict__["deleted_at"]
        assert deleted_at_attr.column.nullable is True

    async def test_version_default_is_one(self):
        version_attr = CommonMixin.__dict__["version"]
        assert version_attr.column.default.arg == 1


class TestGetDb:
    async def test_get_db_yields_and_closes_session(self):
        mock_session = AsyncMock()
        mock_session.close = AsyncMock()

        mock_session_ctx = AsyncMock()
        mock_session_ctx.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session_ctx.__aexit__ = AsyncMock(return_value=False)

        with patch("app.database.async_session", return_value=mock_session_ctx):
            gen = get_db()
            session = await gen.__anext__()
            assert session is mock_session
            try:
                await gen.__anext__()
            except StopAsyncIteration:
                pass
            mock_session.close.assert_awaited_once()
