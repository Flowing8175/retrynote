from unittest.mock import patch

from app.config import _normalize_database_url


def test_normalize_database_url_uses_localhost_outside_docker():
    with patch("app.config.Path.exists", return_value=False):
        assert (
            _normalize_database_url(
                "postgresql+asyncpg://quiz:quiz@db:5432/quizmanager"
            )
            == "postgresql+asyncpg://quiz:quiz@localhost:5432/quizmanager"
        )


def test_normalize_database_url_uses_db_inside_docker():
    with patch("app.config.Path.exists", return_value=True):
        assert (
            _normalize_database_url(
                "postgresql+asyncpg://quiz:quiz@localhost:5432/quizmanager"
            )
            == "postgresql+asyncpg://quiz:quiz@db:5432/quizmanager"
        )
