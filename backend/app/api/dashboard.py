from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select, false
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.quiz import AnswerLog, QuizItem, QuizSession, Judgement
from app.models.objection import WeakPoint
from app.models.user import User
from app.schemas.dashboard import DashboardResponse
from app.middleware.auth import get_current_user
from app.utils.ai_client import stream_ai_text
from app.config import settings as cfg
from app.services.dashboard_service import (
    compute_accuracy_by_type,
    compute_accuracy_by_subject,
    compute_accuracy_by_file,
    compute_weak_concepts_data,
)
import json

router = APIRouter()
COACHING_SUMMARY_CACHE_TTL_SECONDS = 60 * 60


def format_question_type_label(question_type: str) -> str:
    return {
        "multiple_choice": "객관식",
        "ox": "OX",
        "short_answer": "단답형",
        "fill_blank": "빈칸형",
        "essay": "서술형",
    }.get(question_type, question_type)


def sanitize_coaching_summary(message: str | None) -> str | None:
    if message is None:
        return None

    for raw_type, label in {
        "multiple_choice": "객관식",
        "ox": "OX",
        "short_answer": "단답형",
        "fill_blank": "빈칸형",
        "essay": "서술형",
    }.items():
        message = message.replace(raw_type, label)

    return message


def build_coaching_summary_cache_key(
    user_id: str,
    range_value: str,
    file_id: str | None,
    category_tag: str | None,
) -> str:
    return f"dashboard:coaching:{user_id}:{range_value}:{file_id or 'none'}:{category_tag or 'none'}"


def apply_coaching_tone(message: str, _accuracy: float) -> str:
    return message


COACHING_STREAM_SYSTEM_PROMPT = (
    "너는 학습 코치다. 사용자의 학습 데이터를 보고 한두 문장의 짧은 코칭 메시지를 작성한다. "
    "JSON이 아니라 순수 텍스트로만 응답한다. "
    "막연한 동기부여 대신 구체적인 복습 방향을 제시한다. "
    "문제 유형은 객관식/OX/단답형/빈칸형/서술형으로 표기한다."
)


def build_coaching_prompt(
    total_count: int,
    correct_count: int,
    partial_count: int,
    overall_accuracy: float,
    score_rate: float,
    weak_concepts_data: list[dict],
    weak_types: list[dict],
) -> str:
    return f"""사용자의 최근 학습 기록을 분석하고 한두 문장의 코칭 메시지를 작성하세요.

학습 통계:
- 총 문제 수: {total_count}
- 정답 수: {correct_count}
- 부분정답 수: {partial_count}
- 정답률: {overall_accuracy:.0%}
- 점수율: {score_rate:.0%}

취약 개념 TOP 5:
{json.dumps(weak_concepts_data, ensure_ascii=False, indent=2)}

문제 유형별 정답률:
{json.dumps(weak_types, ensure_ascii=False, indent=2)}

한두 문장의 코칭 메시지만 출력하세요. JSON이 아닌 순수 텍스트로 응답하세요."""


async def generate_coaching_summary(
    request: Request,
    user_id: str,
    range_value: str,
    file_id: str | None,
    category_tag: str | None,
    overall_accuracy: float,
    coaching_prompt: str,
) -> str:
    redis_client = getattr(request.app.state, "redis", None)
    cache_key = build_coaching_summary_cache_key(
        user_id, range_value, file_id, category_tag
    )

    if redis_client is not None:
        try:
            cached = await redis_client.get(cache_key)
            if cached is not None:
                sanitized = sanitize_coaching_summary(cached) or cached
                return apply_coaching_tone(sanitized, overall_accuracy)
        except Exception:
            redis_client = None

    collected = ""
    try:
        async for chunk in stream_ai_text(
            coaching_prompt,
            COACHING_STREAM_SYSTEM_PROMPT,
            model=cfg.balanced_generation_model,
            max_tokens=256,
        ):
            collected += chunk
    except Exception:
        pass

    if collected:
        sanitized = sanitize_coaching_summary(collected)
        result = apply_coaching_tone(sanitized or collected, overall_accuracy)
        if redis_client is not None and sanitized:
            try:
                await redis_client.setex(
                    cache_key, COACHING_SUMMARY_CACHE_TTL_SECONDS, sanitized
                )
            except Exception:
                pass
        return result

    fallback = f"정답률 {overall_accuracy:.0%}입니다. 취약 개념 위주로 복습해보세요."
    return apply_coaching_tone(fallback, overall_accuracy)


@router.get("", response_model=DashboardResponse)
async def get_dashboard(
    request: Request,
    range: str = Query("7d", pattern="^(7d|30d|all)$"),
    file_id: str | None = Query(None),
    category_tag: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    now = datetime.now(timezone.utc)
    if range == "7d":
        since = now - timedelta(days=7)
    elif range == "30d":
        since = now - timedelta(days=30)
    else:
        since = datetime(2000, 1, 1)

    base_query = (
        select(AnswerLog)
        .join(QuizItem, AnswerLog.quiz_item_id == QuizItem.id)
        .join(QuizSession, AnswerLog.quiz_session_id == QuizSession.id)
        .where(
            AnswerLog.user_id == user.id,
            AnswerLog.is_active_result.is_(True),
            AnswerLog.deleted_at.is_(None),
            AnswerLog.graded_at >= since,
        )
    )

    if file_id:
        from app.models.quiz import QuizSessionFile

        base_query = base_query.join(
            QuizSessionFile, QuizSessionFile.quiz_session_id == QuizSession.id
        ).where(QuizSessionFile.file_id == file_id)
    if category_tag:
        base_query = base_query.where(QuizItem.category_tag == category_tag)

    result = await db.execute(base_query)
    answers = result.scalars().all()

    quiz_item_ids = list({a.quiz_item_id for a in answers})
    items_result = await db.execute(
        select(QuizItem).where(QuizItem.id.in_(quiz_item_ids))
    )
    quiz_items_by_id: dict[str, QuizItem] = {
        item.id: item for item in items_result.scalars().all()
    }

    total_count = len(answers)
    correct_count = sum(1 for a in answers if a.judgement == Judgement.correct)
    partial_count = sum(1 for a in answers if a.judgement == Judgement.partial)
    total_score = sum(a.score_awarded for a in answers)
    max_score_total = sum(a.max_score for a in answers)

    overall_accuracy = correct_count / total_count if total_count > 0 else 0.0
    score_rate = total_score / max_score_total if max_score_total > 0 else 0.0

    seen_concept_keys = {
        quiz_items_by_id[a.quiz_item_id].concept_key
        for a in answers
        if a.quiz_item_id in quiz_items_by_id
        and quiz_items_by_id[a.quiz_item_id].concept_key
    }
    weak_query = select(WeakPoint).where(WeakPoint.user_id == user.id)
    if seen_concept_keys:
        weak_query = weak_query.where(WeakPoint.concept_key.in_(seen_concept_keys))
    else:
        weak_query = weak_query.where(false())
    weak_result = await db.execute(
        weak_query.order_by(
            (
                WeakPoint.wrong_count + WeakPoint.partial_count + WeakPoint.skip_count
            ).desc()
        ).limit(10)
    )
    weak_concepts = [
        {
            "concept_key": w.concept_key,
            "concept_label": w.concept_label,
            "category_tag": w.category_tag,
            "wrong_count": w.wrong_count,
            "partial_count": w.partial_count,
            "skip_count": w.skip_count,
            "streak_wrong_count": w.streak_wrong_count,
            "recommended_action": w.recommended_action,
        }
        for w in weak_result.scalars().all()
    ]

    accuracy_by_type = compute_accuracy_by_type(answers, quiz_items_by_id)
    accuracy_by_subject = compute_accuracy_by_subject(answers, quiz_items_by_id)
    accuracy_by_file = await compute_accuracy_by_file(db, answers, user.id)

    retry_recommendations = weak_concepts[:5]

    recent_wrong = await db.execute(
        base_query.where(
            AnswerLog.judgement.in_([Judgement.incorrect, Judgement.partial])
        )
        .order_by(AnswerLog.graded_at.desc())
        .limit(5)
    )
    recent_wrong_notes = []
    for a in recent_wrong.scalars().all():
        item = quiz_items_by_id.get(a.quiz_item_id)
        if item:
            recent_wrong_notes.append(
                {
                    "question_text": item.question_text[:100],
                    "concept_key": item.concept_key,
                    "concept_label": item.concept_label,
                    "judgement": a.judgement.value,
                    "graded_at": a.graded_at.isoformat() if a.graded_at else None,
                }
            )

    coaching_summary: str | None = None
    if total_count > 0:
        weak_concepts_data = compute_weak_concepts_data(
            weak_concepts, answers, quiz_items_by_id
        )

        weak_types = sorted(
            [
                {
                    "question_type": format_question_type_label(entry["question_type"]),
                    "accuracy": entry["accuracy"],
                }
                for entry in accuracy_by_type
            ],
            key=lambda x: x["question_type"],
        )

        coaching_prompt = build_coaching_prompt(
            total_count,
            correct_count,
            partial_count,
            overall_accuracy,
            score_rate,
            weak_concepts_data,
            weak_types,
        )

        coaching_summary = await generate_coaching_summary(
            request,
            user.id,
            range,
            file_id,
            category_tag,
            overall_accuracy,
            coaching_prompt,
        )

    return DashboardResponse(
        overall_accuracy=overall_accuracy,
        score_rate=score_rate,
        learning_volume=total_count,
        weak_concepts=weak_concepts,
        accuracy_by_type=accuracy_by_type,
        accuracy_by_subject=accuracy_by_subject,
        accuracy_by_file=accuracy_by_file,
        retry_recommendations=retry_recommendations,
        recent_wrong_notes=recent_wrong_notes,
        coaching_summary=coaching_summary,
    )
