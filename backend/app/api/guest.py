import logging

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.prompts.generation import (
    SYSTEM_PROMPT_QUIZ_GENERATION_MEDIUM,
    build_generation_prompt,
)
from app.rate_limit import limiter
from app.utils.ai_client import call_ai_structured, GENERATION_SCHEMA
from app.config import settings

router = APIRouter()
logger = logging.getLogger(__name__)

GUEST_QUESTION_COUNT = 4
GUEST_DIFFICULTY = "medium"
GUEST_QUESTION_TYPES = ["multiple_choice", "ox", "short_answer"]


class GuestQuizRequest(BaseModel):
    topic: str = Field(..., min_length=2, max_length=200)


class GuestQuizQuestion(BaseModel):
    question_type: str
    question_text: str
    options: dict | None
    correct_answer: dict
    explanation: str
    concept_label: str
    difficulty: str


class GuestQuizResponse(BaseModel):
    topic: str
    questions: list[GuestQuizQuestion]


@router.post("", response_model=GuestQuizResponse)
@limiter.limit("5/hour")
async def generate_guest_quiz(
    request: Request,
    req: GuestQuizRequest,
) -> GuestQuizResponse:
    prompt = build_generation_prompt(
        source_context="",
        question_count=GUEST_QUESTION_COUNT,
        difficulty=GUEST_DIFFICULTY,
        question_types=GUEST_QUESTION_TYPES,
        concept_counts={},
        is_no_source=True,
        topic=req.topic,
    )

    model = settings.eco_generation_model or settings.balanced_generation_model
    if not model:
        raise HTTPException(status_code=503, detail="AI model not configured")

    try:
        result = await call_ai_structured(
            prompt=prompt,
            schema=GENERATION_SCHEMA,
            system_message=SYSTEM_PROMPT_QUIZ_GENERATION_MEDIUM,
            model=model,
            temperature=0.5,
            max_tokens=3000,
            cache_key="quiz_gen_v1",
        )
    except Exception as exc:
        logger.warning("Guest quiz generation failed for topic=%r: %s", req.topic, exc)
        raise HTTPException(
            status_code=503,
            detail="문제 생성에 실패했습니다. 잠시 후 다시 시도해주세요.",
        )

    raw_questions = result.get("questions", [])
    if not raw_questions:
        raise HTTPException(
            status_code=503,
            detail="문제를 생성하지 못했습니다. 주제를 더 구체적으로 입력해 주세요.",
        )

    questions = [
        GuestQuizQuestion(
            question_type=q.get("question_type", "short_answer"),
            question_text=q.get("question_text", ""),
            options=q.get("options"),
            correct_answer=q.get("correct_answer", {}),
            explanation=q.get("explanation", ""),
            concept_label=q.get("concept_label", ""),
            difficulty=q.get("difficulty", GUEST_DIFFICULTY),
        )
        for q in raw_questions[:GUEST_QUESTION_COUNT]
    ]

    return GuestQuizResponse(topic=req.topic, questions=questions)
