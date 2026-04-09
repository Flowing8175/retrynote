"""Dashboard analytics computation — extracted from the get_dashboard endpoint."""

from collections.abc import Sequence
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.quiz import AnswerLog, QuizItem, Judgement, QuizSessionFile
from app.models.file import File


def compute_accuracy_by_type(
    answers: Sequence,
    items_map: dict,
) -> list[dict]:
    """Group answers by question_type, compute correct/total/accuracy.

    Returns list of dicts with question_type, accuracy, count.
    """
    type_accuracy: dict[str, dict] = {}
    for a in answers:
        item = items_map.get(a.quiz_item_id)
        if item:
            qt = item.question_type.value
            if qt not in type_accuracy:
                type_accuracy[qt] = {"correct": 0, "total": 0}
            type_accuracy[qt]["total"] += 1
            if a.judgement == Judgement.correct:
                type_accuracy[qt]["correct"] += 1

    return [
        {
            "question_type": qt,
            "accuracy": data["correct"] / data["total"] if data["total"] > 0 else 0.0,
            "count": data["total"],
        }
        for qt, data in type_accuracy.items()
    ]


def compute_accuracy_by_subject(
    answers: Sequence,
    items_map: dict,
) -> list[dict]:
    """Group answers by category_tag, compute correct/total/accuracy.

    Returns list of dicts with category_tag, accuracy, count.
    """
    subject_accuracy: dict[str, dict] = {}
    for a in answers:
        item = items_map.get(a.quiz_item_id)
        if item and item.category_tag:
            cat = item.category_tag
            if cat not in subject_accuracy:
                subject_accuracy[cat] = {"correct": 0, "total": 0}
            subject_accuracy[cat]["total"] += 1
            if a.judgement == Judgement.correct:
                subject_accuracy[cat]["correct"] += 1

    return [
        {
            "category_tag": cat,
            "accuracy": data["correct"] / data["total"] if data["total"] > 0 else 0.0,
            "count": data["total"],
        }
        for cat, data in subject_accuracy.items()
    ]


async def compute_accuracy_by_file(
    db: AsyncSession,
    answers: Sequence,
    user_id: str,
) -> list[dict]:
    """Group answers by source file, compute correct/total/accuracy.

    Returns list of dicts with file_id, filename, accuracy, count.
    """
    if not answers:
        return []

    answer_session_ids = {a.quiz_session_id for a in answers}
    sf_batch = await db.execute(
        select(QuizSessionFile, File)
        .join(File, File.id == QuizSessionFile.file_id)
        .where(QuizSessionFile.quiz_session_id.in_(answer_session_ids))
    )
    session_to_files: dict[str, list[tuple[str, str | None]]] = {}
    for sf, f in sf_batch.all():
        session_to_files.setdefault(sf.quiz_session_id, []).append(
            (sf.file_id, f.original_filename if f else None)
        )

    file_accuracy: dict[str, dict] = {}
    for a in answers:
        for fid, fname in session_to_files.get(a.quiz_session_id, []):
            if fid not in file_accuracy:
                file_accuracy[fid] = {
                    "file_id": fid,
                    "filename": fname or fid,
                    "correct": 0,
                    "total": 0,
                }
            file_accuracy[fid]["total"] += 1
            if a.judgement == Judgement.correct:
                file_accuracy[fid]["correct"] += 1

    return [
        {
            "file_id": v["file_id"],
            "filename": v["filename"],
            "accuracy": v["correct"] / v["total"] if v["total"] > 0 else 0.0,
            "count": v["total"],
        }
        for v in file_accuracy.values()
    ]


def compute_weak_concepts_data(
    weak_concepts: list[dict],
    answers: Sequence,
    items_map: dict,
) -> list[dict]:
    """Enrich weak concepts with per-concept accuracy from recent answers.

    Returns list of dicts with concept_key, concept_label, wrong_count, accuracy.
    """
    result = []
    for w in weak_concepts[:5]:
        total_for_concept = 0
        correct_for_concept = 0
        for a in answers:
            item = items_map.get(a.quiz_item_id)
            if item and item.concept_key == w["concept_key"]:
                total_for_concept += 1
                if a.judgement == Judgement.correct:
                    correct_for_concept += 1
        accuracy = (
            correct_for_concept / total_for_concept if total_for_concept > 0 else 0.0
        )
        result.append(
            {
                "concept_key": w["concept_key"],
                "concept_label": w["concept_label"],
                "wrong_count": w["wrong_count"],
                "accuracy": accuracy,
            }
        )
    return result
