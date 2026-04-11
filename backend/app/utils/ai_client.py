import asyncio
import hashlib
import json
import logging
import time
import uuid
from openai import AsyncOpenAI
from app.config import settings
from typing import Any

logger = logging.getLogger(__name__)

# Gemini explicit-cache minimum is ~1024 tokens on Flash (~4096 tokens on Pro).
# ~4 chars per token is the conservative heuristic; skip creation below this
# to avoid a guaranteed INVALID_ARGUMENT from the API.
_GEMINI_CACHE_MIN_CHARS = 4096

__all__ = [
    "GENERATION_SCHEMA",
    "RETRY_GENERATION_SCHEMA",
    "BATCH_RETRY_GENERATION_SCHEMA",
    "GRADING_SCHEMA",
    "OBJECTION_REVIEW_SCHEMA",
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
    cached_tokens: int = 0,
    cache_key: str | None = None,
) -> None:
    try:
        from app.database import async_session
        from app.models.admin import SystemLog

        meta: dict[str, Any] = {
            "model": model,
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": total_tokens,
            "cached_tokens": cached_tokens,
        }
        if prompt_tokens > 0:
            meta["cached_token_ratio"] = round(cached_tokens / prompt_tokens, 4)
        if cache_key:
            meta["cache_key"] = cache_key

        async with async_session() as session:
            log = SystemLog(
                id=str(uuid.uuid4()),
                level="INFO",
                service_name="ai_client",
                event_type="ai_token_usage",
                message=f"Token usage for model {model}",
                meta_json=meta,
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


class _GeminiCacheRegistry:
    """In-process registry of Gemini explicit context caches.

    Keyed by (model, system_instruction) hash. Caches are created lazily on
    first use and refreshed after TTL. Fails open — any creation error
    returns None so callers fall back to sending the system instruction
    inline on every request.
    """

    def __init__(self) -> None:
        self._entries: dict[str, tuple[str, float]] = {}
        self._lock = asyncio.Lock()

    @staticmethod
    def _key(model: str, system_instruction: str) -> str:
        h = hashlib.sha256()
        h.update(model.encode("utf-8"))
        h.update(b"\0")
        h.update(system_instruction.encode("utf-8"))
        return h.hexdigest()[:16]

    def evict(self, model: str, system_instruction: str) -> None:
        self._entries.pop(self._key(model, system_instruction), None)

    async def get_or_create(
        self, model: str, system_instruction: str
    ) -> str | None:
        if not settings.gemini_context_cache_enabled:
            return None
        if len(system_instruction) < _GEMINI_CACHE_MIN_CHARS:
            return None

        key = self._key(model, system_instruction)
        now = time.monotonic()
        entry = self._entries.get(key)
        if entry is not None and entry[1] > now:
            return entry[0]

        async with self._lock:
            entry = self._entries.get(key)
            if entry is not None and entry[1] > time.monotonic():
                return entry[0]

            try:
                from google.genai import types

                gemini = _get_gemini_client()
                ttl = settings.gemini_context_cache_ttl_seconds
                cached = await gemini.aio.caches.create(
                    model=model,
                    config=types.CreateCachedContentConfig(
                        display_name=f"retrynote-{key}",
                        system_instruction=system_instruction,
                        ttl=f"{ttl}s",
                    ),
                )
            except Exception as exc:
                logger.warning(
                    "Gemini cache creation failed for model=%s: %s", model, exc
                )
                return None

            cache_name = getattr(cached, "name", None)
            if not cache_name:
                return None
            # Expire the local entry a bit before the server-side TTL so we
            # never try to use a cache that Gemini already GC'd.
            expires_at = time.monotonic() + max(60, ttl - 60)
            self._entries[key] = (cache_name, expires_at)
            logger.info(
                "Created Gemini context cache %s for model=%s (ttl=%ss)",
                cache_name,
                model,
                ttl,
            )
            return cache_name


_gemini_cache_registry = _GeminiCacheRegistry()


GENERATION_SCHEMA = {
    "type": "object",
    "required": ["questions"],
    "properties": {
        "rejected": {"type": "boolean"},
        "rejection_reason": {"type": "string"},
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


def _is_cache_not_found_error(exc: Exception) -> bool:
    msg = str(exc).lower()
    return "cached" in msg and ("not found" in msg or "expired" in msg or "invalid" in msg)


async def _call_gemini_structured(
    prompt: str,
    schema: dict,
    system_message: str,
    model: str,
    temperature: float = 0.3,
    max_tokens: int = 4096,
    cache_key: str | None = None,
) -> dict[str, Any]:
    from google.genai import types

    gemini = _get_gemini_client()
    cache_name = await _gemini_cache_registry.get_or_create(model, system_message)

    def _build_config(use_cache: bool) -> types.GenerateContentConfig:
        kwargs: dict[str, Any] = {
            "temperature": temperature,
            "max_output_tokens": max_tokens,
            "response_mime_type": "application/json",
            "response_schema": schema,
        }
        if use_cache and cache_name:
            kwargs["cached_content"] = cache_name
        else:
            kwargs["system_instruction"] = system_message
        return types.GenerateContentConfig(**kwargs)

    try:
        response = await gemini.aio.models.generate_content(
            model=model,
            contents=prompt,
            config=_build_config(use_cache=True),
        )
    except Exception as exc:
        if cache_name and _is_cache_not_found_error(exc):
            logger.warning(
                "Gemini cache %s rejected (%s); evicting and retrying inline",
                cache_name,
                exc,
            )
            _gemini_cache_registry.evict(model, system_message)
            cache_name = None
            response = await gemini.aio.models.generate_content(
                model=model,
                contents=prompt,
                config=_build_config(use_cache=False),
            )
        else:
            raise

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
                cached_tokens=getattr(usage, "cached_content_token_count", 0) or 0,
                cache_key=cache_key,
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
    cache_key: str | None = None,
    cache_retention: str | None = None,
) -> dict[str, Any]:
    model = model or settings.balanced_generation_model

    if model.startswith("gemini-"):
        return await _call_gemini_structured(
            prompt,
            schema,
            system_message,
            model,
            temperature,
            max_tokens,
            cache_key=cache_key,
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

    if cache_key:
        completion_kwargs["prompt_cache_key"] = cache_key
    if cache_retention:
        completion_kwargs["prompt_cache_retention"] = cache_retention

    response = await client.chat.completions.create(**completion_kwargs, timeout=60)
    content = response.choices[0].message.content
    if content is None:
        raise ValueError("AI returned empty response")
    result = json.loads(content)
    if response.usage is not None:
        cached = 0
        details = getattr(response.usage, "prompt_tokens_details", None)
        if details is not None:
            cached = getattr(details, "cached_tokens", 0) or 0
        asyncio.create_task(
            _log_token_usage(
                model,
                response.usage.prompt_tokens,
                response.usage.completion_tokens,
                response.usage.total_tokens,
                cached_tokens=cached,
                cache_key=cache_key,
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
    cache_key: str | None = None,
    cache_retention: str | None = None,
):
    """Yield text chunks from OpenAI streaming API (non-structured, plain text)."""
    model = model or settings.balanced_generation_model

    if model.startswith("gemini-"):
        from google.genai import types

        gemini = _get_gemini_client()
        cache_name = await _gemini_cache_registry.get_or_create(model, system_message)

        def _build_stream_config(use_cache: bool) -> types.GenerateContentConfig:
            kwargs: dict[str, Any] = {
                "temperature": temperature,
                "max_output_tokens": max_tokens,
            }
            if use_cache and cache_name:
                kwargs["cached_content"] = cache_name
            else:
                kwargs["system_instruction"] = system_message
            return types.GenerateContentConfig(**kwargs)

        try:
            stream = await gemini.aio.models.generate_content_stream(
                model=model,
                contents=prompt,
                config=_build_stream_config(use_cache=True),
            )
        except Exception as exc:
            if cache_name and _is_cache_not_found_error(exc):
                logger.warning(
                    "Gemini cache %s rejected on stream (%s); retrying inline",
                    cache_name,
                    exc,
                )
                _gemini_cache_registry.evict(model, system_message)
                cache_name = None
                stream = await gemini.aio.models.generate_content_stream(
                    model=model,
                    contents=prompt,
                    config=_build_stream_config(use_cache=False),
                )
            else:
                raise

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
    if cache_key:
        kwargs["prompt_cache_key"] = cache_key
    if cache_retention:
        kwargs["prompt_cache_retention"] = cache_retention
    stream = await client.chat.completions.create(**kwargs)  # type: ignore[call-overload]
    async for chunk in stream:
        delta = chunk.choices[0].delta if chunk.choices else None
        if delta and delta.content:
            yield delta.content
