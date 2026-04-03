import json
from openai import AsyncOpenAI
from app.config import settings
from typing import Any

__all__ = [
    "GENERATION_SCHEMA",
    "RETRY_GENERATION_SCHEMA",
    "BATCH_RETRY_GENERATION_SCHEMA",
    "GRADING_SCHEMA",
    "OBJECTION_REVIEW_SCHEMA",
    "COACHING_SCHEMA",
    "call_ai_structured",
    "call_ai_with_fallback",
]

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


async def call_ai_structured(
    prompt: str,
    schema: dict,
    system_message: str,
    model: str | None = None,
    temperature: float = 0.3,
    max_tokens: int = 4096,
) -> dict[str, Any]:
    model = model or settings.openai_generation_model
    system = system_message
    completion_kwargs: dict[str, Any] = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
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
