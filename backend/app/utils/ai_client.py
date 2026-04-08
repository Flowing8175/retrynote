import asyncio
import json
import logging
import uuid
from openai import AsyncOpenAI
from app.config import settings
from typing import Any

logger = logging.getLogger(__name__)

__all__ = [
    "GENERATION_SCHEMA",
    "RETRY_GENERATION_SCHEMA",
    "BATCH_RETRY_GENERATION_SCHEMA",
    "GRADING_SCHEMA",
    "OBJECTION_REVIEW_SCHEMA",
    "COACHING_SCHEMA",
    "call_ai_structured",
    "call_ai_with_fallback",
    "stream_ai_text",
]

client = AsyncOpenAI(api_key=settings.openai_api_key)

_gemini_client = None


async def _log_token_usage(
    model: str,
    prompt_tokens: int,
    completion_tokens: int,
    total_tokens: int,
) -> None:
    try:
        from app.database import async_session
        from app.models.admin import SystemLog

        async with async_session() as session:
            log = SystemLog(
                id=str(uuid.uuid4()),
                level="INFO",
                service_name="ai_client",
                event_type="ai_token_usage",
                message=f"Token usage for model {model}",
                meta_json={
                    "model": model,
                    "prompt_tokens": prompt_tokens,
                    "completion_tokens": completion_tokens,
                    "total_tokens": total_tokens,
                },
            )
            session.add(log)
            await session.commit()
    except Exception as exc:
        logger.warning("Failed to log token usage: %s", exc)


def _get_gemini_client():
    global _gemini_client
    if _gemini_client is None:
        from google import genai

        _gemini_client = genai.Client(api_key=settings.gemini_api_key)
    return _gemini_client


GENERATION_SCHEMA = {
    "type": "object",
    "required": ["questions"],
    "properties": {
        "questions": {
            "type": "array",
            "items": {
                "type": "object",
                "required": [
                    "question_type",
                    "question_text",
                    "options",
                    "correct_answer",
                    "explanation",
                    "concept_key",
                    "concept_label",
                    "category_tag",
                    "difficulty",
                    "source_refs",
                    "low_confidence_source",
                ],
                "properties": {
                    "question_type": {
                        "type": "string",
                        "enum": [
                            "multiple_choice",
                            "ox",
                            "short_answer",
                            "fill_blank",
                            "essay",
                        ],
                    },
                    "question_text": {"type": "string"},
                    "options": {"type": ["object", "null"]},
                    "correct_answer": {"type": "object"},
                    "explanation": {"type": "string"},
                    "concept_key": {"type": "string"},
                    "concept_label": {"type": "string"},
                    "category_tag": {"type": "string"},
                    "difficulty": {"type": "string"},
                    "source_refs": {
                        "type": ["array", "null"],
                        "items": {"type": "object"},
                    },
                    "low_confidence_source": {"type": "boolean"},
                },
                "additionalProperties": False,
            },
        }
    },
    "additionalProperties": False,
}


RETRY_GENERATION_SCHEMA = {
    "type": "object",
    "required": [
        "question_type",
        "question_text",
        "correct_answer",
        "explanation",
        "concept_key",
        "targeted_error_type",
    ],
    "properties": {
        "question_type": {
            "type": "string",
            "enum": ["multiple_choice", "ox", "short_answer", "fill_blank", "essay"],
        },
        "question_text": {"type": "string"},
        "options": {"type": ["object", "null"]},
        "correct_answer": {"type": "object"},
        "explanation": {"type": "string"},
        "concept_key": {"type": "string"},
        "targeted_error_type": {"type": "string"},
        "hint": {"type": ["string", "null"]},
        "similarity_safety_note": {"type": ["string", "null"]},
    },
    "additionalProperties": False,
}


BATCH_RETRY_GENERATION_SCHEMA = {
    "type": "object",
    "required": ["questions"],
    "properties": {
        "questions": {
            "type": "array",
            "items": {
                "type": "object",
                "required": [
                    "question_type",
                    "question_text",
                    "correct_answer",
                    "explanation",
                    "concept_key",
                    "targeted_error_type",
                ],
                "properties": {
                    "question_type": {
                        "type": "string",
                        "enum": [
                            "multiple_choice",
                            "ox",
                            "short_answer",
                            "fill_blank",
                            "essay",
                        ],
                    },
                    "question_text": {"type": "string"},
                    "options": {"type": ["object", "null"]},
                    "correct_answer": {"type": "object"},
                    "explanation": {"type": "string"},
                    "concept_key": {"type": "string"},
                    "targeted_error_type": {"type": "string"},
                    "hint": {"type": ["string", "null"]},
                    "similarity_safety_note": {"type": ["string", "null"]},
                },
                "additionalProperties": False,
            },
        }
    },
    "additionalProperties": False,
}

GRADING_SCHEMA = {
    "type": "object",
    "required": [
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
    ],
    "properties": {
        "judgement": {
            "type": "string",
            "enum": ["correct", "partial", "incorrect", "skipped"],
        },
        "score_awarded": {"type": "number"},
        "max_score": {"type": "number"},
        "normalized_user_answer": {"type": "string"},
        "accepted_answers": {"type": "array", "items": {"type": "string"}},
        "grading_confidence": {"type": "number"},
        "grading_rationale": {"type": "string"},
        "missing_points": {"type": ["array", "null"], "items": {"type": "string"}},
        "error_type": {
            "type": ["string", "null"],
            "enum": [
                "concept_confusion",
                "missing_keyword",
                "expression_mismatch",
                "careless_mistake",
                "ambiguous_question",
                "insufficient_source",
                "reasoning_error",
                "no_response",
            ],
        },
        "suggested_feedback": {"type": "string"},
    },
    "additionalProperties": False,
}


OBJECTION_REVIEW_SCHEMA = {
    "type": "object",
    "required": [
        "decision",
        "reasoning",
        "updated_judgement",
        "updated_score_awarded",
        "updated_error_type",
        "should_apply",
    ],
    "properties": {
        "decision": {
            "type": "string",
            "enum": ["upheld", "rejected", "partially_upheld"],
        },
        "reasoning": {"type": "string"},
        "updated_judgement": {
            "type": "string",
            "enum": ["correct", "partial", "incorrect", "skipped"],
        },
        "updated_score_awarded": {"type": "number"},
        "updated_error_type": {"type": ["string", "null"]},
        "should_apply": {"type": "boolean"},
    },
    "additionalProperties": False,
}


COACHING_SCHEMA = {
    "type": "object",
    "required": [
        "summary",
        "weak_concepts_top",
        "weak_question_types",
        "recommended_next_actions",
        "coaching_message",
    ],
    "properties": {
        "summary": {"type": "string"},
        "weak_concepts_top": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["concept_key", "concept_label", "wrong_count", "accuracy"],
                "properties": {
                    "concept_key": {"type": "string"},
                    "concept_label": {"type": "string"},
                    "wrong_count": {"type": "integer"},
                    "accuracy": {"type": "number"},
                },
            },
        },
        "weak_question_types": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["question_type", "accuracy"],
                "properties": {
                    "question_type": {"type": "string"},
                    "accuracy": {"type": "number"},
                },
            },
        },
        "recommended_next_actions": {
            "type": "array",
            "items": {"type": "string"},
        },
        "coaching_message": {"type": "string"},
    },
    "additionalProperties": False,
}


async def _call_gemini_structured(
    prompt: str,
    schema: dict,
    system_message: str,
    model: str,
    temperature: float = 0.3,
    max_tokens: int = 4096,
) -> dict[str, Any]:
    from google.genai import types

    gemini = _get_gemini_client()
    response = await gemini.aio.models.generate_content(
        model=model,
        contents=prompt,
        config=types.GenerateContentConfig(
            system_instruction=system_message,
            temperature=temperature,
            max_output_tokens=max_tokens,
            response_mime_type="application/json",
            response_schema=schema,
        ),
    )
    if not response.text:
        raise ValueError("Gemini returned empty response")
    result = json.loads(response.text)
    usage = response.usage_metadata
    if usage is not None:
        asyncio.create_task(
            _log_token_usage(
                model,
                getattr(usage, "prompt_token_count", 0) or 0,
                getattr(usage, "candidates_token_count", 0) or 0,
                getattr(usage, "total_token_count", 0) or 0,
            )
        )
    return result


async def call_ai_structured(
    prompt: str,
    schema: dict,
    system_message: str,
    model: str | None = None,
    temperature: float = 0.3,
    max_tokens: int = 4096,
) -> dict[str, Any]:
    model = model or settings.balanced_generation_model

    if model.startswith("gemini-"):
        return await _call_gemini_structured(
            prompt, schema, system_message, model, temperature, max_tokens
        )

    completion_kwargs: dict[str, Any] = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_message},
            {"role": "user", "content": prompt},
        ],
        "temperature": temperature,
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "structured_response",
                "schema": schema,
                "strict": False,
            },
        },
    }

    if model.startswith("gpt-5"):
        completion_kwargs["max_completion_tokens"] = max_tokens
    else:
        completion_kwargs["max_tokens"] = max_tokens

    response = await client.chat.completions.create(**completion_kwargs, timeout=60)
    content = response.choices[0].message.content
    if content is None:
        raise ValueError("AI returned empty response")
    result = json.loads(content)
    if response.usage is not None:
        asyncio.create_task(
            _log_token_usage(
                model,
                response.usage.prompt_tokens,
                response.usage.completion_tokens,
                response.usage.total_tokens,
            )
        )
    return result


async def call_ai_with_fallback(
    prompt: str,
    schema: dict,
    primary_model: str,
    fallback_model: str,
    **kwargs,
) -> dict[str, Any]:
    try:
        return await call_ai_structured(prompt, schema, model=primary_model, **kwargs)
    except Exception as e:
        logger.warning(
            "Primary model %s failed (%s: %s), retrying with fallback %s",
            primary_model,
            type(e).__name__,
            e,
            fallback_model,
        )
        return await call_ai_structured(prompt, schema, model=fallback_model, **kwargs)


async def stream_ai_text(
    prompt: str,
    system_message: str,
    model: str | None = None,
    temperature: float = 0.3,
    max_tokens: int = 512,
):
    """Yield text chunks from OpenAI streaming API (non-structured, plain text)."""
    model = model or settings.balanced_generation_model

    if model.startswith("gemini-"):
        from google.genai import types

        gemini = _get_gemini_client()
        stream = await gemini.aio.models.generate_content_stream(
            model=model,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_message,
                temperature=temperature,
                max_output_tokens=max_tokens,
            ),
        )
        async for chunk in stream:
            if chunk.text:
                yield chunk.text
        return

    token_limit_key = (
        "max_completion_tokens" if model.startswith("gpt-5") else "max_tokens"
    )
    kwargs: dict[str, Any] = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_message},
            {"role": "user", "content": prompt},
        ],
        "temperature": temperature,
        token_limit_key: max_tokens,
        "stream": True,
    }
    stream = await client.chat.completions.create(**kwargs)  # type: ignore[call-overload]
    async for chunk in stream:
        delta = chunk.choices[0].delta if chunk.choices else None
        if delta and delta.content:
            yield delta.content
