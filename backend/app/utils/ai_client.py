import json
from openai import AsyncOpenAI
from app.config import settings
from typing import Any

client = AsyncOpenAI(api_key=settings.openai_api_key)


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
                None,
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


async def call_ai_structured(
    prompt: str,
    schema: dict,
    model: str | None = None,
    system_message: str = "You are a helpful educational AI assistant. Always respond with valid JSON.",
    temperature: float = 0.3,
    max_tokens: int = 4096,
) -> dict[str, Any]:
    model = model or settings.openai_generation_model
    completion_kwargs: dict[str, Any] = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_message},
            {"role": "user", "content": prompt},
        ],
        "temperature": temperature,
        "response_format": {"type": "json_object"},
    }

    if model.startswith("gpt-5"):
        completion_kwargs["max_completion_tokens"] = max_tokens
    else:
        completion_kwargs["max_tokens"] = max_tokens

    response = await client.chat.completions.create(**completion_kwargs)
    content = response.choices[0].message.content
    if content is None:
        raise ValueError("AI returned empty response")
    result = json.loads(content)
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
    except Exception:
        return await call_ai_structured(prompt, schema, model=fallback_model, **kwargs)
