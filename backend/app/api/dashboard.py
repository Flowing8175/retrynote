from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.quiz import AnswerLog, QuizItem, QuizSession, Judgement, QuestionType
from app.models.objection import WeakPoint
from app.models.file import File
from app.models.user import User
from app.schemas.dashboard import DashboardResponse, DashboardQuery
from app.middleware.auth import get_current_user

router = APIRouter()


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
        item_result = await db.execute(
            select(QuizItem).where(QuizItem.id == a.quiz_item_id)
        )
        item = item_result.scalar_one_or_none()
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
        item_result = await db.execute(
            select(QuizItem).where(QuizItem.id == a.quiz_item_id)
        )
        item = item_result.scalar_one_or_none()
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
        item_result = await db.execute(
            select(QuizItem).where(QuizItem.id == a.quiz_item_id)
        )
        item = item_result.scalar_one_or_none()
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
        if overall_accuracy >= 0.8:
            coaching_summary = (
                f"정답률 {overall_accuracy:.0%}로 우수한 학습 성과를 보이고 있습니다."
            )
        elif overall_accuracy >= 0.5:
            coaching_summary = (
                f"정답률 {overall_accuracy:.0%}입니다. 취약 개념 위주로 복습해보세요."
            )
        else:
            coaching_summary = f"정답률 {overall_accuracy:.0%}로 개선이 필요합니다. 기초 개념부터 다시 학습을 권장합니다."

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
