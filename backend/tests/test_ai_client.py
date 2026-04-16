import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.utils.ai_client import (
    GENERATION_SCHEMA,
    RETRY_GENERATION_SCHEMA,
    GRADING_SCHEMA,
    OBJECTION_REVIEW_SCHEMA,
    call_ai_structured,
    call_ai_with_fallback,
)


def _make_mock_response(content_dict: dict) -> MagicMock:
    message = MagicMock()
    message.content = json.dumps(content_dict)
    choice = MagicMock()
    choice.message = message
    response = MagicMock()
    response.choices = [choice]
    response.usage = None
    return response


def _make_none_response() -> MagicMock:
    message = MagicMock()
    message.content = None
    choice = MagicMock()
    choice.message = message
    response = MagicMock()
    response.choices = [choice]
    response.usage = None
    return response


class TestGenerationSchema:
    def test_is_valid_dict_with_questions_required(self):
        assert isinstance(GENERATION_SCHEMA, dict)
        assert "questions" in GENERATION_SCHEMA["required"]


class TestRetryGenerationSchema:
    def test_has_required_fields(self):
        required = RETRY_GENERATION_SCHEMA["required"]
        for field in [
            "question_type",
            "question_text",
            "correct_answer",
            "explanation",
            "concept_key",
            "targeted_error_type",
        ]:
            assert field in required


class TestGradingSchema:
    def test_has_all_10_required_fields(self):
        required = GRADING_SCHEMA["required"]
        assert len(required) == 10
        for field in [
            "judgement",
            "score_awarded",
            "max_score",
            "normalized_user_answer",
            "accepted_answers",
            "grading_confidence",
            "grading_rationale",
            "missing_points",
            "error_type",
            "suggested_feedback",
        ]:
            assert field in required


class TestObjectionReviewSchema:
    def test_has_all_6_required_fields(self):
        required = OBJECTION_REVIEW_SCHEMA["required"]
        assert len(required) == 6
        for field in [
            "decision",
            "reasoning",
            "updated_judgement",
            "updated_score_awarded",
            "updated_error_type",
            "should_apply",
        ]:
            assert field in required


class TestCallAiStructured:
    async def test_returns_parsed_json(self):
        payload = {"questions": [{"q": "test"}]}
        mock_client = MagicMock()
        mock_client.chat.completions.create = AsyncMock(
            return_value=_make_mock_response(payload)
        )

        with patch("app.utils.ai_client.client", mock_client):
            result, tokens = await call_ai_structured(
                prompt="generate",
                schema=GENERATION_SCHEMA,
                system_message="You are a quiz generator",
                model="gpt-4o",
            )

        assert result == payload
        assert tokens == 0

    async def test_max_completion_tokens_for_gpt5(self):
        mock_client = MagicMock()
        mock_create = AsyncMock(return_value=_make_mock_response({"ok": True}))
        mock_client.chat.completions.create = mock_create

        with patch("app.utils.ai_client.client", mock_client):
            await call_ai_structured(
                prompt="test",
                schema={},
                system_message="sys",
                model="gpt-5-turbo",
                max_tokens=2048,
            )

        call_kwargs = mock_create.call_args[1]
        assert "max_completion_tokens" in call_kwargs
        assert call_kwargs["max_completion_tokens"] == 2048
        assert "max_tokens" not in call_kwargs

    async def test_max_tokens_for_non_gpt5(self):
        mock_client = MagicMock()
        mock_create = AsyncMock(return_value=_make_mock_response({"ok": True}))
        mock_client.chat.completions.create = mock_create

        with patch("app.utils.ai_client.client", mock_client):
            await call_ai_structured(
                prompt="test",
                schema={},
                system_message="sys",
                model="gpt-4o",
                max_tokens=2048,
            )

        call_kwargs = mock_create.call_args[1]
        assert "max_tokens" in call_kwargs
        assert call_kwargs["max_tokens"] == 2048
        assert "max_completion_tokens" not in call_kwargs

    async def test_raises_value_error_on_none_content(self):
        mock_client = MagicMock()
        mock_client.chat.completions.create = AsyncMock(
            return_value=_make_none_response()
        )

        with patch("app.utils.ai_client.client", mock_client):
            with pytest.raises(ValueError, match="AI returned empty response"):
                await call_ai_structured(
                    prompt="test",
                    schema={},
                    system_message="sys",
                    model="gpt-4o",
                )


class TestCallAiWithFallback:
    async def test_primary_succeeds(self):
        payload = {"result": "primary"}
        mock_client = MagicMock()
        mock_client.chat.completions.create = AsyncMock(
            return_value=_make_mock_response(payload)
        )

        with patch("app.utils.ai_client.client", mock_client):
            result, tokens = await call_ai_with_fallback(
                prompt="test",
                schema={},
                primary_model="gpt-4o",
                fallback_model="gpt-4o-mini",
                system_message="sys",
            )

        assert result == payload
        assert tokens == 0

    async def test_primary_fails_falls_back(self):
        primary_payload = {"result": "fallback"}
        mock_client = MagicMock()

        call_count = 0

        async def side_effect(**kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise RuntimeError("primary failed")
            return _make_mock_response(primary_payload)

        mock_client.chat.completions.create = AsyncMock(side_effect=side_effect)

        with patch("app.utils.ai_client.client", mock_client):
            result, tokens = await call_ai_with_fallback(
                prompt="test",
                schema={},
                primary_model="gpt-4o",
                fallback_model="gpt-4o-mini",
                system_message="sys",
            )

        assert result == primary_payload
        assert tokens == 0
        assert call_count == 2

    async def test_both_fail_raises_fallback_exception(self):
        mock_client = MagicMock()
        mock_client.chat.completions.create = AsyncMock(
            side_effect=RuntimeError("all models failed")
        )

        with patch("app.utils.ai_client.client", mock_client):
            with pytest.raises(RuntimeError, match="all models failed"):
                await call_ai_with_fallback(
                    prompt="test",
                    schema={},
                    primary_model="gpt-4o",
                    fallback_model="gpt-4o-mini",
                    system_message="sys",
                )
