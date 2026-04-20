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
    "DIFFICULTY_SELECTION_SCHEMA",
    "call_ai_structured",
    "call_ai_with_fallback",
    "stream_ai_text",
    "stream_ai_structured_with_thinking",
    "get_gemini_client",
    "get_claude_client",
]

client = AsyncOpenAI(api_key=settings.openai_api_key)

_gemini_client = None
_claude_client = None


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
        if not settings.gemini_api_key:
            raise RuntimeError("GEMINI_API_KEY is not configured")
        from google import genai

        _gemini_client = genai.Client(api_key=settings.gemini_api_key)
    return _gemini_client


get_gemini_client = _get_gemini_client


def _get_claude_client():
    global _claude_client
    if _claude_client is None:
        if not settings.anthropic_api_key:
            raise RuntimeError("ANTHROPIC_API_KEY is not configured")
        from anthropic import AsyncAnthropic

        _claude_client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    return _claude_client


get_claude_client = _get_claude_client


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

    async def get_or_create(self, model: str, system_instruction: str) -> str | None:
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


_OPTIONS_PROPERTIES = {
    "a": {"type": "string"},
    "b": {"type": "string"},
    "c": {"type": "string"},
    "d": {"type": "string"},
    "o": {"type": "string"},
    "x": {"type": "string"},
}

_OPTION_DESCRIPTIONS_PROPERTIES = {
    "a": {"type": "string"},
    "b": {"type": "string"},
    "c": {"type": "string"},
    "d": {"type": "string"},
}

_CORRECT_ANSWER_PROPERTIES = {
    "answer": {"type": "string"},
    "acceptable_answers": {"type": ["array", "null"], "items": {"type": "string"}},
    "key_points": {"type": ["array", "null"], "items": {"type": "string"}},
}

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
                    "options": {
                        "type": ["object", "null"],
                        "properties": _OPTIONS_PROPERTIES,
                    },
                    "option_descriptions": {
                        "type": ["object", "null"],
                        "properties": _OPTION_DESCRIPTIONS_PROPERTIES,
                    },
                    "correct_answer": {
                        "type": "object",
                        "properties": _CORRECT_ANSWER_PROPERTIES,
                        "required": ["answer"],
                    },
                    "explanation": {"type": "string"},
                    "concept_key": {"type": "string"},
                    "concept_label": {"type": "string"},
                    "category_tag": {"type": "string"},
                    "difficulty": {"type": "string"},
                    "source_refs": {
                        "type": ["array", "null"],
                        "items": {"type": "string"},
                    },
                },
                "additionalProperties": False,
            },
        },
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
        "options": {
            "type": ["object", "null"],
            "properties": _OPTIONS_PROPERTIES,
        },
        "option_descriptions": {
            "type": ["object", "null"],
            "properties": _OPTION_DESCRIPTIONS_PROPERTIES,
        },
        "correct_answer": {
            "type": "object",
            "properties": _CORRECT_ANSWER_PROPERTIES,
            "required": ["answer"],
        },
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
                    "options": {
                        "type": ["object", "null"],
                        "properties": _OPTIONS_PROPERTIES,
                    },
                    "option_descriptions": {
                        "type": ["object", "null"],
                        "properties": _OPTION_DESCRIPTIONS_PROPERTIES,
                    },
                    "correct_answer": {
                        "type": "object",
                        "properties": _CORRECT_ANSWER_PROPERTIES,
                        "required": ["answer"],
                    },
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

DIFFICULTY_SELECTION_SCHEMA = {
    "type": "object",
    "required": ["difficulty", "reason"],
    "properties": {
        "difficulty": {"type": "string", "enum": ["easy", "medium", "hard"]},
        "reason": {"type": "string"},
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
    return "cached" in msg and (
        "not found" in msg or "expired" in msg or "invalid" in msg
    )


def _jsonschema_to_gemini(node: dict) -> dict:
    """Convert JSON Schema nullable unions to Gemini-compatible format.

    Gemini expects ``type`` to be a single enum string (``OBJECT``, ``ARRAY``, …)
    with a separate ``nullable: true`` flag, whereas JSON Schema uses
    ``type: ["object", "null"]``.  Also strips ``additionalProperties`` which
    Gemini does not recognise.
    """
    out: dict[str, Any] = {}
    for key, value in node.items():
        if key == "additionalProperties":
            continue
        if key == "type" and isinstance(value, list):
            non_null = [t for t in value if t != "null"]
            out["type"] = non_null[0].upper() if non_null else "STRING"
            if "null" in value:
                out["nullable"] = True
        elif key == "type" and isinstance(value, str):
            out["type"] = value.upper()
        elif key == "properties" and isinstance(value, dict):
            out["properties"] = {k: _jsonschema_to_gemini(v) for k, v in value.items()}
        elif key == "items" and isinstance(value, dict):
            out["items"] = _jsonschema_to_gemini(value)
        else:
            out[key] = value
    return out


async def _call_gemini_structured(
    prompt: str,
    schema: dict,
    system_message: str,
    model: str,
    temperature: float = 0.3,
    max_tokens: int = 4096,
    cache_key: str | None = None,
) -> tuple[dict[str, Any], int]:
    from google.genai import types

    gemini = _get_gemini_client()
    cache_name = await _gemini_cache_registry.get_or_create(model, system_message)
    gemini_schema = _jsonschema_to_gemini(schema)

    def _build_config(use_cache: bool) -> types.GenerateContentConfig:
        kwargs: dict[str, Any] = {
            "temperature": temperature,
            "max_output_tokens": max_tokens,
            "response_mime_type": "application/json",
            "response_schema": gemini_schema,
        }
        if use_cache and cache_name:
            kwargs["cached_content"] = cache_name
        else:
            kwargs["system_instruction"] = system_message
        return types.GenerateContentConfig(**kwargs)

    _GEMINI_REQUEST_TIMEOUT = 120

    try:
        response = await asyncio.wait_for(
            gemini.aio.models.generate_content(
                model=model,
                contents=prompt,
                config=_build_config(use_cache=True),
            ),
            timeout=_GEMINI_REQUEST_TIMEOUT,
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
            response = await asyncio.wait_for(
                gemini.aio.models.generate_content(
                    model=model,
                    contents=prompt,
                    config=_build_config(use_cache=False),
                ),
                timeout=_GEMINI_REQUEST_TIMEOUT,
            )
        else:
            raise

    if not response.text:
        raise ValueError("Gemini returned empty response")
    result = json.loads(response.text)
    usage = response.usage_metadata
    total_tokens = 0
    if usage is not None:
        total_tokens = getattr(usage, "total_token_count", 0) or 0
        asyncio.create_task(
            _log_token_usage(
                model,
                getattr(usage, "prompt_token_count", 0) or 0,
                getattr(usage, "candidates_token_count", 0) or 0,
                total_tokens,
                cached_tokens=getattr(usage, "cached_content_token_count", 0) or 0,
                cache_key=cache_key,
            )
        )
    return result, total_tokens


async def _call_claude_structured(
    prompt: str,
    schema: dict,
    system_message: str,
    model: str,
    temperature: float = 0.3,
    max_tokens: int = 4096,
    cache_key: str | None = None,
) -> tuple[dict[str, Any], int]:
    claude = _get_claude_client()
    tool_name = "structured_response"
    response = await claude.messages.create(
        model=model,
        max_tokens=max_tokens,
        system=system_message,
        messages=[{"role": "user", "content": prompt}],
        tools=[
            {
                "name": tool_name,
                "description": "Return the structured response matching the required schema.",
                "input_schema": schema,
            }
        ],
        tool_choice={"type": "tool", "name": tool_name},
        temperature=temperature,
        timeout=60,
    )

    result: dict[str, Any] | None = None
    for block in response.content:
        if (
            getattr(block, "type", None) == "tool_use"
            and getattr(block, "name", "") == tool_name
        ):
            result = block.input
            break
    if result is None:
        raise ValueError("Claude returned no tool_use block matching schema")

    usage = response.usage
    prompt_tokens = getattr(usage, "input_tokens", 0) or 0
    completion_tokens = getattr(usage, "output_tokens", 0) or 0
    cached_tokens = getattr(usage, "cache_read_input_tokens", 0) or 0
    total_tokens = prompt_tokens + completion_tokens

    asyncio.create_task(
        _log_token_usage(
            model,
            prompt_tokens,
            completion_tokens,
            total_tokens,
            cached_tokens=cached_tokens,
            cache_key=cache_key,
        )
    )
    return result, total_tokens


async def call_ai_structured(
    prompt: str,
    schema: dict,
    system_message: str,
    model: str | None = None,
    temperature: float = 0.3,
    max_tokens: int = 4096,
    cache_key: str | None = None,
    cache_retention: str | None = None,
    strict: bool = False,
) -> tuple[dict[str, Any], int]:
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

    if model.startswith("claude-"):
        return await _call_claude_structured(
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
                "strict": strict,
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
    total_tokens = 0
    if response.usage is not None:
        total_tokens = response.usage.total_tokens
        cached = 0
        details = getattr(response.usage, "prompt_tokens_details", None)
        if details is not None:
            cached = getattr(details, "cached_tokens", 0) or 0
        asyncio.create_task(
            _log_token_usage(
                model,
                response.usage.prompt_tokens,
                response.usage.completion_tokens,
                total_tokens,
                cached_tokens=cached,
                cache_key=cache_key,
            )
        )
    return result, total_tokens


async def call_ai_with_fallback(
    prompt: str,
    schema: dict,
    primary_model: str,
    fallback_model: str,
    **kwargs,
) -> tuple[dict[str, Any], int]:
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


_THINKING_LEVEL_MAP: dict[str, Any] = {}


def _is_openai_reasoning_model(model: str) -> bool:
    m = model.lower()
    return (
        m.startswith("gpt-5")
        or m.startswith("o1")
        or m.startswith("o3")
        or m.startswith("o4")
    )


async def _stream_gemini_structured_with_thinking(
    prompt: str,
    schema: dict,
    system_message: str,
    model: str,
    temperature: float,
    max_tokens: int,
    cache_key: str | None,
    thinking_level: str,
):
    from google.genai import types

    global _THINKING_LEVEL_MAP
    if not _THINKING_LEVEL_MAP:
        _THINKING_LEVEL_MAP = {
            "MINIMAL": types.ThinkingLevel.MINIMAL,
            "LOW": types.ThinkingLevel.LOW,
            "MEDIUM": types.ThinkingLevel.MEDIUM,
            "HIGH": types.ThinkingLevel.HIGH,
        }

    level_enum = _THINKING_LEVEL_MAP.get(
        thinking_level.upper(), types.ThinkingLevel.MEDIUM
    )

    gemini = _get_gemini_client()
    gemini_schema = _jsonschema_to_gemini(schema)

    thinking_kwargs: dict[str, Any] = {"include_thoughts": True}
    if model.startswith("gemini-3") or model.startswith("gemini-4"):
        thinking_kwargs["thinking_level"] = level_enum

    config = types.GenerateContentConfig(
        temperature=temperature,
        max_output_tokens=max_tokens,
        system_instruction=system_message,
        response_mime_type="application/json",
        response_schema=gemini_schema,
        thinking_config=types.ThinkingConfig(**thinking_kwargs),
    )

    stream = await gemini.aio.models.generate_content_stream(
        model=model,
        contents=prompt,
        config=config,
    )

    full_json = ""
    prompt_tokens = 0
    completion_tokens = 0
    total_tokens = 0
    cached_tokens = 0

    async for chunk in stream:
        if not chunk.candidates:
            continue
        content = chunk.candidates[0].content
        parts = content.parts if content else None
        if parts:
            for part in parts:
                text = part.text or ""
                if not text:
                    continue
                if getattr(part, "thought", False):
                    yield {"type": "thinking", "text": text}
                elif text.startswith("THOUGHT:"):
                    yield {"type": "thinking", "text": text[len("THOUGHT:") :].lstrip()}
                else:
                    full_json += text
        usage = chunk.usage_metadata
        if usage is not None:
            prompt_tokens = getattr(usage, "prompt_token_count", 0) or 0
            completion_tokens = getattr(usage, "candidates_token_count", 0) or 0
            total_tokens = getattr(usage, "total_token_count", 0) or 0
            cached_tokens = getattr(usage, "cached_content_token_count", 0) or 0

    if not full_json:
        raise ValueError("Gemini returned empty response body")

    asyncio.create_task(
        _log_token_usage(
            model,
            prompt_tokens,
            completion_tokens,
            total_tokens,
            cached_tokens=cached_tokens,
            cache_key=cache_key,
        )
    )

    result = json.loads(full_json)
    yield {"type": "result", "data": result, "tokens_used": total_tokens}


async def _stream_openai_structured_with_reasoning(
    prompt: str,
    schema: dict,
    system_message: str,
    model: str,
    max_tokens: int,
    reasoning_effort: str,
    strict: bool,
):
    from openai.types.shared_params import Reasoning
    from openai.types.responses import ResponseTextConfigParam

    reasoning_param: Reasoning = {
        "effort": reasoning_effort,  # type: ignore[typeddict-item]
        "summary": "auto",
    }
    text_param: ResponseTextConfigParam = {
        "format": {
            "type": "json_schema",
            "name": "structured_response",
            "schema": schema,
            "strict": strict,
        }
    }
    stream = await client.responses.create(
        model=model,
        input=[
            {"role": "system", "content": system_message},
            {"role": "user", "content": prompt},
        ],
        reasoning=reasoning_param,
        text=text_param,
        max_output_tokens=max_tokens,
        stream=True,
    )

    output_text = ""
    total_tokens = 0
    prompt_tokens = 0
    completion_tokens = 0
    cached_tokens = 0

    async for event in stream:
        et = getattr(event, "type", None)
        if et in (
            "response.reasoning_summary_text.delta",
            "response.reasoning_text.delta",
        ):
            delta = getattr(event, "delta", None)
            if isinstance(delta, str) and delta:
                yield {"type": "thinking", "text": delta}
        elif et == "response.output_text.delta":
            delta = getattr(event, "delta", None)
            if isinstance(delta, str):
                output_text += delta
        elif et == "response.completed":
            resp = getattr(event, "response", None)
            usage = getattr(resp, "usage", None) if resp else None
            if usage is not None:
                total_tokens = getattr(usage, "total_tokens", 0) or 0
                prompt_tokens = getattr(usage, "input_tokens", 0) or 0
                completion_tokens = getattr(usage, "output_tokens", 0) or 0
                details = getattr(usage, "input_tokens_details", None)
                if details is not None:
                    cached_tokens = getattr(details, "cached_tokens", 0) or 0

    if not output_text:
        raise ValueError("OpenAI Responses API returned empty output")

    asyncio.create_task(
        _log_token_usage(
            model,
            prompt_tokens,
            completion_tokens,
            total_tokens,
            cached_tokens=cached_tokens,
        )
    )

    result = json.loads(output_text)
    yield {"type": "result", "data": result, "tokens_used": total_tokens}


_CLAUDE_THINKING_BUDGET_MAP: dict[str, int] = {
    "MINIMAL": 1024,
    "LOW": 2048,
    "MEDIUM": 4096,
    "HIGH": 8192,
}


async def _stream_claude_structured_with_thinking(
    prompt: str,
    schema: dict,
    system_message: str,
    model: str,
    max_tokens: int,
    cache_key: str | None,
    thinking_level: str,
):
    claude = _get_claude_client()
    tool_name = "structured_response"

    budget_tokens = _CLAUDE_THINKING_BUDGET_MAP.get(thinking_level.upper(), 8192)
    if budget_tokens >= max_tokens:
        budget_tokens = max(1024, max_tokens // 2)

    request_kwargs: dict[str, Any] = {
        "model": model,
        "max_tokens": max_tokens,
        "system": system_message,
        "messages": [{"role": "user", "content": prompt}],
        "tools": [
            {
                "name": tool_name,
                "description": "Return the structured response matching the required schema.",
                "input_schema": schema,
            }
        ],
        "tool_choice": {"type": "tool", "name": tool_name},
        "thinking": {"type": "enabled", "budget_tokens": budget_tokens},
        # Anthropic requires temperature=1.0 when extended thinking is enabled.
        "temperature": 1.0,
    }

    async with claude.messages.stream(**request_kwargs) as stream:
        async for event in stream:
            etype = getattr(event, "type", None)
            if etype != "content_block_delta":
                continue
            delta = getattr(event, "delta", None)
            if getattr(delta, "type", None) == "thinking_delta":
                text = getattr(delta, "thinking", "") or ""
                if text:
                    yield {"type": "thinking", "text": text}

        final_message = await stream.get_final_message()

    tool_input: dict[str, Any] | None = None
    for block in final_message.content:
        if (
            getattr(block, "type", None) == "tool_use"
            and getattr(block, "name", "") == tool_name
        ):
            tool_input = block.input
            break
    if tool_input is None:
        raise ValueError("Claude returned no tool_use block matching schema")

    usage = final_message.usage
    prompt_tokens = getattr(usage, "input_tokens", 0) or 0
    completion_tokens = getattr(usage, "output_tokens", 0) or 0
    cached_tokens = getattr(usage, "cache_read_input_tokens", 0) or 0
    total_tokens = prompt_tokens + completion_tokens

    asyncio.create_task(
        _log_token_usage(
            model,
            prompt_tokens,
            completion_tokens,
            total_tokens,
            cached_tokens=cached_tokens,
            cache_key=cache_key,
        )
    )
    yield {"type": "result", "data": tool_input, "tokens_used": total_tokens}


async def _stream_thinking_dispatch(
    prompt: str,
    schema: dict,
    system_message: str,
    model: str,
    temperature: float,
    max_tokens: int,
    cache_key: str | None,
    reasoning_effort: str,
    thinking_level: str,
    strict: bool,
):
    if model.startswith("gemini-"):
        async for event in _stream_gemini_structured_with_thinking(
            prompt=prompt,
            schema=schema,
            system_message=system_message,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
            cache_key=cache_key,
            thinking_level=thinking_level,
        ):
            yield event
    elif model.startswith("claude-"):
        async for event in _stream_claude_structured_with_thinking(
            prompt=prompt,
            schema=schema,
            system_message=system_message,
            model=model,
            max_tokens=max_tokens,
            cache_key=cache_key,
            thinking_level=thinking_level,
        ):
            yield event
    elif _is_openai_reasoning_model(model):
        async for event in _stream_openai_structured_with_reasoning(
            prompt=prompt,
            schema=schema,
            system_message=system_message,
            model=model,
            max_tokens=max_tokens,
            reasoning_effort=reasoning_effort,
            strict=strict,
        ):
            yield event
    else:
        result, tokens = await call_ai_structured(
            prompt=prompt,
            schema=schema,
            system_message=system_message,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
            cache_key=cache_key,
            strict=strict,
        )
        yield {"type": "result", "data": result, "tokens_used": tokens}


async def stream_ai_structured_with_thinking(
    prompt: str,
    schema: dict,
    system_message: str,
    primary_model: str,
    fallback_model: str | None = None,
    temperature: float = 0.3,
    max_tokens: int = 16384,
    cache_key: str | None = None,
    reasoning_effort: str = "medium",
    thinking_level: str = "HIGH",
    strict: bool = False,
):
    """Yield native Chain-of-Thought + structured output events.

    Emits ``{"type": "thinking", "text": str}`` as the model reasons, then
    one final ``{"type": "result", "data": dict, "tokens_used": int}``.

    Falls back to ``fallback_model`` only if the primary fails before any
    event has been yielded (otherwise the user would see thinking restart).
    """
    emitted_any = False
    try:
        async for event in _stream_thinking_dispatch(
            prompt=prompt,
            schema=schema,
            system_message=system_message,
            model=primary_model,
            temperature=temperature,
            max_tokens=max_tokens,
            cache_key=cache_key,
            reasoning_effort=reasoning_effort,
            thinking_level=thinking_level,
            strict=strict,
        ):
            emitted_any = True
            yield event
        return
    except Exception as exc:
        if not (fallback_model and not emitted_any):
            raise
        logger.warning(
            "Primary %s failed (%s: %s); falling back to %s",
            primary_model,
            type(exc).__name__,
            exc,
            fallback_model,
        )

    async for event in _stream_thinking_dispatch(
        prompt=prompt,
        schema=schema,
        system_message=system_message,
        model=fallback_model,
        temperature=temperature,
        max_tokens=max_tokens,
        cache_key=cache_key,
        reasoning_effort=reasoning_effort,
        thinking_level=thinking_level,
        strict=strict,
    ):
        yield event


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

    if model.startswith("claude-"):
        claude = _get_claude_client()
        async with claude.messages.stream(
            model=model,
            max_tokens=max_tokens,
            system=system_message,
            messages=[{"role": "user", "content": prompt}],
            temperature=temperature,
        ) as stream:
            async for text in stream.text_stream:
                if text:
                    yield text
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
