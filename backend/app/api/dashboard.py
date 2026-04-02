from datetime import datetime, timedelta, timezone
from hashlib import sha256
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
import redis.asyncio as redis

from app.database import get_db
from app.models.quiz import AnswerLog, QuizItem, QuizSession, Judgement, QuestionType
from app.models.objection import WeakPoint
from app.models.file import File
from app.models.user import User
from app.schemas.dashboard import DashboardResponse, DashboardQuery
from app.middleware.auth import get_current_user
from app.utils.ai_client import call_ai_with_fallback
from app.utils.ai_client import COACHING_SCHEMA
from app.config import settings as cfg
from app.prompts import SYSTEM_PROMPT_DASHBOARD_COACHING
import json

router = APIRouter()
COACHING_SUMMARY_CACHE_TTL_SECONDS = 60 * 60
_redis_client: redis.Redis | None = None


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
    cache_payload: dict,
) -> str:
    payload_hash = sha256(
        json.dumps(
            cache_payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")
        ).encode("utf-8")
    ).hexdigest()
    return (
        "dashboard:coaching:"
        f"{user_id}:{range_value}:{file_id or 'none'}:{category_tag or 'none'}:{payload_hash}"
    )


async def get_redis_client() -> redis.Redis:
    global _redis_client

    if _redis_client is None:
        _redis_client = redis.from_url(cfg.redis_url, decode_responses=True)

    return _redis_client


def apply_coaching_tone(message: str, accuracy: float) -> str:
    if accuracy >= 0.8 and "우수" not in message:
        return f"현재 성과가 우수합니다. {message}"

    if accuracy < 0.5 and "개선" not in message:
        return f"현재 결과는 개선이 필요합니다. {message}"

    if 0.5 <= accuracy < 0.8 and "취약" not in message:
        return f"현재 취약한 부분이 보입니다. {message}"

    return message


@router.get("", response_model=DashboardResponse)
async def get_dashboard(
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
            AnswerLog.is_active_result == True,
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

    weak_result = await db.execute(
        select(WeakPoint)
        .where(WeakPoint.user_id == user.id)
        .order_by(
            (
                WeakPoint.wrong_count + WeakPoint.partial_count + WeakPoint.skip_count
            ).desc()
        )
        .limit(10)
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

    type_accuracy = {}
    for a in answers:
        item = quiz_items_by_id.get(a.quiz_item_id)
        if item:
            qt = item.question_type.value
            if qt not in type_accuracy:
                type_accuracy[qt] = {"correct": 0, "total": 0}
            type_accuracy[qt]["total"] += 1
            if a.judgement == Judgement.correct:
                type_accuracy[qt]["correct"] += 1

    accuracy_by_type = [
        {
            "question_type": qt,
            "accuracy": data["correct"] / data["total"] if data["total"] > 0 else 0.0,
            "count": data["total"],
        }
        for qt, data in type_accuracy.items()
    ]

    subject_accuracy = {}
    for a in answers:
        item = quiz_items_by_id.get(a.quiz_item_id)
        if item and item.category_tag:
            cat = item.category_tag
            if cat not in subject_accuracy:
                subject_accuracy[cat] = {"correct": 0, "total": 0}
            subject_accuracy[cat]["total"] += 1
            if a.judgement == Judgement.correct:
                subject_accuracy[cat]["correct"] += 1

    accuracy_by_subject = [
        {
            "category_tag": cat,
            "accuracy": data["correct"] / data["total"] if data["total"] > 0 else 0.0,
            "count": data["total"],
        }
        for cat, data in subject_accuracy.items()
    ]

    from app.models.quiz import QuizSessionFile

    file_accuracy: dict[str, dict] = {}
    for a in answers:
        session_files_result = await db.execute(
            select(QuizSessionFile).where(
                QuizSessionFile.quiz_session_id == a.quiz_session_id
            )
        )
        for sf in session_files_result.scalars().all():
            fid = sf.file_id
            if fid not in file_accuracy:
                f_result = await db.execute(select(File).where(File.id == fid))
                f = f_result.scalar_one_or_none()
                file_accuracy[fid] = {
                    "file_id": fid,
                    "filename": f.original_filename if f else fid,
                    "correct": 0,
                    "total": 0,
                }
            file_accuracy[fid]["total"] += 1
            if a.judgement == Judgement.correct:
                file_accuracy[fid]["correct"] += 1

    accuracy_by_file = [
        {
            "file_id": v["file_id"],
            "filename": v["filename"],
            "accuracy": v["correct"] / v["total"] if v["total"] > 0 else 0.0,
            "count": v["total"],
        }
        for v in file_accuracy.values()
    ]

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

    coaching_summary = None
    if total_count > 0:
        weak_concepts_data = []
        for w in weak_concepts[:5]:
            total_for_concept = 0
            correct_for_concept = 0
            for a in answers:
                item = quiz_items_by_id.get(a.quiz_item_id)
                if item and item.concept_key == w["concept_key"]:
                    total_for_concept += 1
                    if a.judgement == Judgement.correct:
                        correct_for_concept += 1
            accuracy = (
                correct_for_concept / total_for_concept
                if total_for_concept > 0
                else 0.0
            )
            weak_concepts_data.append(
                {
                    "concept_key": w["concept_key"],
                    "concept_label": w["concept_label"],
                    "wrong_count": w["wrong_count"],
                    "accuracy": accuracy,
                }
            )

        weak_types = [
            {
                "question_type": format_question_type_label(qt),
                "accuracy": data["correct"] / data["total"]
                if data["total"] > 0
                else 0.0,
            }
            for qt, data in type_accuracy.items()
        ]

        weak_types = sorted(weak_types, key=lambda item: item["question_type"])

        coaching_cache_payload = {
            "total_count": total_count,
            "correct_count": correct_count,
            "partial_count": partial_count,
            "overall_accuracy": round(overall_accuracy, 6),
            "score_rate": round(score_rate, 6),
            "weak_concepts_data": weak_concepts_data,
            "weak_types": weak_types,
        }

        coaching_cache_key = build_coaching_summary_cache_key(
            user.id,
            range,
            file_id,
            category_tag,
            coaching_cache_payload,
        )

        coaching_prompt = f"""사용자의 최근 학습 기록을 분석하고 코칭 요약을 생성하세요.

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

JSON 형식으로 응답하세요:
{{"summary": "...", "weak_concepts_top": [...], "weak_question_types": [...], "recommended_next_actions": [...], "coaching_message": "..."}}"""

        redis_client = None
        try:
            redis_client = await get_redis_client()
            cached_summary = await redis_client.get(coaching_cache_key)
            if cached_summary is not None:
                coaching_summary = apply_coaching_tone(cached_summary, overall_accuracy)
        except Exception:
            redis_client = None

        if coaching_summary is None:
            try:
                coaching_result = await call_ai_with_fallback(
                    coaching_prompt,
                    COACHING_SCHEMA,
                    primary_model=cfg.openai_grading_model,
                    fallback_model=cfg.openai_fallback_grading_model,
                    system_message=SYSTEM_PROMPT_DASHBOARD_COACHING,
                )
                sanitized_summary = sanitize_coaching_summary(
                    coaching_result.get("coaching_message", "학습을 계속해보세요.")
                )
                coaching_summary = apply_coaching_tone(
                    sanitized_summary or "학습을 계속해보세요.",
                    overall_accuracy,
                )
            except Exception:
                coaching_summary = apply_coaching_tone(
                    f"정답률 {overall_accuracy:.0%}입니다. 취약 개념 위주로 복습해보세요.",
                    overall_accuracy,
                )

            if redis_client is not None and coaching_summary is not None:
                try:
                    await redis_client.setex(
                        coaching_cache_key,
                        COACHING_SUMMARY_CACHE_TTL_SECONDS,
                        coaching_summary,
                    )
                except Exception:
                    pass

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
