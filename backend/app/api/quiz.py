import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.quiz import (
    QuizSession,
    QuizSessionStatus,
    QuizMode,
    SourceMode,
    QuizItem,
    QuestionType,
    AnswerLog,
    Judgement,
    ErrorType,
    QuizSessionFile,
)
from app.models.user import User
from app.models.file import File, FileStatus
from app.models.search import Job, DraftAnswer
from app.schemas.quiz import (
    QuizSessionCreate,
    QuizSessionResponse,
    QuizSessionDetail,
    QuizSessionHistoryItem,
    QuizItemResponse,
    QuizItemDetail,
    AnswerSubmit,
    AnswerResponse,
    DraftAnswerSubmit,
    DraftAnswerResponse,
    ExamSubmit,
    ExamSubmitResponse,
)
from app.middleware.auth import get_current_user
from app.workers.celery_app import celery_app

router = APIRouter()


@router.get("", response_model=list[QuizSessionHistoryItem])
async def list_quiz_sessions(
    limit: int = Query(10, ge=1, le=20),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(QuizSession)
        .where(
            QuizSession.user_id == user.id,
            QuizSession.deleted_at.is_(None),
        )
        .order_by(QuizSession.created_at.desc())
        .limit(limit)
    )

    sessions = result.scalars().all()
    return [
        QuizSessionHistoryItem(
            id=session.id,
            mode=session.mode.value,
            source_mode=session.source_mode.value,
            status=session.status.value,
            question_count=session.question_count,
            difficulty=session.difficulty,
            total_score=session.total_score,
            max_score=session.max_score,
            created_at=session.created_at,
        )
        for session in sessions
    ]


@router.post("", response_model=QuizSessionResponse)
async def create_quiz_session(
    req: QuizSessionCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if req.idempotency_key:
        existing = await db.execute(
            select(QuizSession).where(
                QuizSession.idempotency_key == req.idempotency_key
            )
        )
        existing_session = existing.scalar_one_or_none()
        if existing_session:
            return QuizSessionResponse(
                quiz_session_id=existing_session.id,
                status=existing_session.status.value,
                job_id=None,
            )

    if req.source_mode == SourceMode.document_based.value:
        for fid in req.selected_file_ids:
            result = await db.execute(select(File).where(File.id == fid))
            f = result.scalar_one_or_none()
            if not f or f.user_id != user.id:
                raise HTTPException(
                    status_code=403, detail=f"File {fid} not accessible"
                )
            if (
                f.status not in (FileStatus.ready, FileStatus.failed_partial)
                or not f.is_quiz_eligible
            ):
                raise HTTPException(
                    status_code=400, detail=f"File {fid} is not quiz eligible"
                )

    from app.config import settings as cfg

    session_status = QuizSessionStatus.draft
    job_id = None

    session = QuizSession(
        user_id=user.id,
        mode=QuizMode(req.mode),
        source_mode=SourceMode(req.source_mode),
        status=session_status,
        difficulty=req.difficulty,
        question_count=req.question_count,
        generation_priority=req.generation_priority,
        generation_model_name=cfg.openai_generation_model,
        grading_model_name=cfg.openai_grading_model,
        idempotency_key=req.idempotency_key,
    )
    db.add(session)
    await db.flush()

    for fid in req.selected_file_ids:
        db.add(QuizSessionFile(quiz_session_id=session.id, file_id=fid))

    if req.manual_text:
        file_record = File(
            user_id=user.id,
            source_type="manual_text",
            file_type="txt",
            file_size_bytes=len(req.manual_text.encode("utf-8")),
            status=FileStatus.ready,
            is_searchable=True,
            is_quiz_eligible=True,
        )
        db.add(file_record)
        await db.flush()
        db.add(QuizSessionFile(quiz_session_id=session.id, file_id=file_record.id))

    job = Job(
        id=str(uuid.uuid4()),
        job_type="quiz_generation",
        status="pending",
        target_type="quiz_session",
        target_id=session.id,
        payload_json={
            "question_count": req.question_count,
            "difficulty": req.difficulty,
            "question_types": req.question_types,
            "source_mode": req.source_mode,
        },
    )
    db.add(job)
    session.status = QuizSessionStatus.generating
    job_id = job.id

    await db.commit()
    await db.refresh(session)

    celery_app.send_task("generate_quiz", args=[job_id])

    return QuizSessionResponse(
        quiz_session_id=session.id,
        status=session.status.value,
        job_id=job_id,
    )


@router.get("/{session_id}", response_model=QuizSessionDetail)
async def get_quiz_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(QuizSession).where(QuizSession.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.user_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    items_count = await db.execute(
        select(func.count())
        .select_from(QuizItem)
        .where(QuizItem.quiz_session_id == session_id)
    )

    return QuizSessionDetail(
        id=session.id,
        mode=session.mode.value,
        source_mode=session.source_mode.value,
        status=session.status.value,
        difficulty=session.difficulty,
        question_count=session.question_count,
        generation_model_name=session.generation_model_name,
        grading_model_name=session.grading_model_name,
        started_at=session.started_at,
        submitted_at=session.submitted_at,
        graded_at=session.graded_at,
        total_score=session.total_score,
        max_score=session.max_score,
        items_count=items_count.scalar() or 0,
        created_at=session.created_at,
    )


@router.get("/{session_id}/items", response_model=list[QuizItemResponse])
async def get_quiz_items(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    session_result = await db.execute(
        select(QuizSession).where(QuizSession.id == session_id)
    )
    session = session_result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.user_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    result = await db.execute(
        select(QuizItem)
        .where(QuizItem.quiz_session_id == session_id)
        .order_by(QuizItem.item_order)
    )
    items = result.scalars().all()

    if session.mode == QuizMode.exam and session.status not in (
        QuizSessionStatus.graded,
        QuizSessionStatus.regraded,
        QuizSessionStatus.closed,
    ):
        return [
            QuizItemResponse(
                id=i.id,
                item_order=i.item_order,
                question_type=i.question_type.value,
                question_text=i.question_text,
                options=i.options_json,
                difficulty=i.difficulty,
                concept_label=i.concept_label,
                category_tag=i.category_tag,
            )
            for i in items
        ]

    return [
        QuizItemResponse(
            id=i.id,
            item_order=i.item_order,
            question_type=i.question_type.value,
            question_text=i.question_text,
            options=i.options_json,
            difficulty=i.difficulty,
            concept_label=i.concept_label,
            category_tag=i.category_tag,
        )
        for i in items
    ]


@router.post("/{session_id}/items/{item_id}/answer", response_model=AnswerResponse)
async def submit_answer(
    session_id: str,
    item_id: str,
    req: AnswerSubmit,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    session_result = await db.execute(
        select(QuizSession).where(QuizSession.id == session_id)
    )
    session = session_result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.user_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    if session.mode != QuizMode.normal:
        raise HTTPException(status_code=400, detail="Use exam submit for exam mode")
    if session.status not in (QuizSessionStatus.ready, QuizSessionStatus.in_progress):
        raise HTTPException(status_code=400, detail="Session is not in progress")

    item_result = await db.execute(select(QuizItem).where(QuizItem.id == item_id))
    item = item_result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    if session.status == QuizSessionStatus.ready:
        session.status = QuizSessionStatus.in_progress
        session.started_at = datetime.now(timezone.utc)

    from app.utils.normalize import normalize_answer
    from app.utils.ai_client import call_ai_with_fallback, GRADING_SCHEMA
    from app.config import settings as cfg
    from app.prompts.grading_short import SYSTEM_PROMPT_GRADING_SHORT
    from app.prompts.grading_essay import SYSTEM_PROMPT_GRADING_ESSAY
    import json

    raw_correct_answer = item.correct_answer_json
    if isinstance(raw_correct_answer, dict):
        correct_answer = raw_correct_answer
    elif isinstance(raw_correct_answer, str):
        correct_answer = {"answer": raw_correct_answer}
    else:
        correct_answer = {}

    normalized = normalize_answer(req.user_answer)
    judgement = Judgement.incorrect
    score_awarded = 0.0
    max_score = 1.0
    grading_confidence = 1.0
    grading_rationale = ""
    error_type = None
    missing_points = None
    suggested_feedback = ""
    accepted_answers = []

    if item.question_type in (QuestionType.multiple_choice, QuestionType.ox):
        correct_value = normalize_answer(str(correct_answer.get("answer", "")))
        user_value = normalized
        if user_value == correct_value:
            judgement = Judgement.correct
            score_awarded = 1.0
        else:
            judgement = Judgement.incorrect
            error_type = ErrorType.careless_mistake

        accepted_answers = [correct_value]

    elif item.question_type in (QuestionType.short_answer, QuestionType.fill_blank):
        accepted = correct_answer.get(
            "accepted_answers", [correct_answer.get("answer", "")]
        )
        accepted_answers = accepted

        matched = False
        for ans in accepted:
            if normalize_answer(str(ans)) == normalized:
                matched = True
                break

        if matched:
            judgement = Judgement.correct
            score_awarded = 1.0
        else:
            try:
                prompt = f"""채점할 답안:
문제: {item.question_text}
정답: {json.dumps(correct_answer, ensure_ascii=False)}
사용자 답: {req.user_answer}
정규화된 답: {normalized}

다음 필드를 포함한 JSON으로 응답하세요:
judgement, score_awarded, max_score, normalized_user_answer, accepted_answers, grading_confidence, grading_rationale, missing_points, error_type, suggested_feedback"""

                ai_result = await call_ai_with_fallback(
                    prompt,
                    GRADING_SCHEMA,
                    primary_model=session.grading_model_name
                    or cfg.openai_grading_model,
                    fallback_model=cfg.openai_fallback_grading_model,
                    system_message=SYSTEM_PROMPT_GRADING_SHORT,
                )
                judgement = Judgement(ai_result["judgement"])
                score_awarded = ai_result["score_awarded"]
                grading_confidence = ai_result.get("grading_confidence", 0.7)
                grading_rationale = ai_result.get("grading_rationale", "")
                error_type = (
                    ErrorType(ai_result["error_type"])
                    if ai_result.get("error_type")
                    else None
                )
                missing_points = ai_result.get("missing_points")
                suggested_feedback = ai_result.get("suggested_feedback", "")
            except Exception:
                judgement = Judgement.incorrect

    elif item.question_type == QuestionType.essay:
        try:
            prompt = f"""채점할 서술형 답안:
문제: {item.question_text}
모범 답안: {json.dumps(correct_answer, ensure_ascii=False)}
사용자 답: {req.user_answer}
출처 참조: {json.dumps(item.source_refs_json or {}, ensure_ascii=False)}

다음 필드를 포함한 JSON으로 응답하세요:
judgement, score_awarded, max_score, normalized_user_answer, accepted_answers, grading_confidence, grading_rationale, missing_points, error_type, suggested_feedback"""

            ai_result = await call_ai_with_fallback(
                prompt,
                GRADING_SCHEMA,
                primary_model=session.grading_model_name or cfg.openai_grading_model,
                fallback_model=cfg.openai_fallback_grading_model,
                system_message=SYSTEM_PROMPT_GRADING_ESSAY,
            )
            judgement = Judgement(ai_result["judgement"])
            score_awarded = ai_result["score_awarded"]
            grading_confidence = ai_result.get("grading_confidence", 0.7)
            grading_rationale = ai_result.get("grading_rationale", "")
            error_type = (
                ErrorType(ai_result["error_type"])
                if ai_result.get("error_type")
                else None
            )
            missing_points = ai_result.get("missing_points")
            suggested_feedback = ai_result.get("suggested_feedback", "")
        except Exception:
            judgement = Judgement.incorrect

    existing_active = await db.execute(
        select(AnswerLog).where(
            AnswerLog.quiz_item_id == item_id,
            AnswerLog.user_id == user.id,
            AnswerLog.is_active_result == True,
        )
    )
    for old_log in existing_active.scalars().all():
        old_log.is_active_result = False

    answer_log = AnswerLog(
        quiz_item_id=item_id,
        quiz_session_id=session_id,
        user_id=user.id,
        user_answer_raw=req.user_answer,
        user_answer_normalized=normalized,
        judgement=judgement,
        score_awarded=score_awarded,
        max_score=max_score,
        grading_confidence=grading_confidence,
        grading_rationale=grading_rationale,
        missing_points_json=missing_points,
        error_type=error_type,
        is_active_result=True,
        graded_at=datetime.now(timezone.utc),
    )
    db.add(answer_log)

    all_items = await db.execute(
        select(QuizItem)
        .where(QuizItem.quiz_session_id == session_id)
        .order_by(QuizItem.item_order)
    )
    items_list = all_items.scalars().all()
    all_answered = True
    next_item_id = None
    for i, it in enumerate(items_list):
        if it.id == item_id:
            continue
        check = await db.execute(
            select(AnswerLog).where(
                AnswerLog.quiz_item_id == it.id,
                AnswerLog.user_id == user.id,
                AnswerLog.is_active_result == True,
            )
        )
        if not check.scalar_one_or_none():
            if next_item_id is None:
                next_item_id = it.id
            all_answered = False

    if all_answered:
        session.status = QuizSessionStatus.submitted
        total_result = await db.execute(
            select(
                func.sum(AnswerLog.score_awarded), func.sum(AnswerLog.max_score)
            ).where(
                AnswerLog.quiz_session_id == session_id,
                AnswerLog.user_id == user.id,
                AnswerLog.is_active_result == True,
            )
        )
        row = total_result.one()
        session.total_score = row[0] or 0.0
        session.max_score = row[1] or 0.0
        session.submitted_at = datetime.now(timezone.utc)
        session.graded_at = datetime.now(timezone.utc)
        session.status = QuizSessionStatus.graded

    await db.commit()
    await db.refresh(answer_log)

    return AnswerResponse(
        answer_log_id=answer_log.id,
        judgement=judgement.value,
        score_awarded=score_awarded,
        max_score=max_score,
        grading_confidence=grading_confidence,
        grading_rationale=grading_rationale,
        missing_points=missing_points,
        error_type=error_type.value if error_type else None,
        normalized_user_answer=normalized,
        suggested_feedback=suggested_feedback,
        next_item_id=next_item_id,
    )


@router.post("/{session_id}/draft-answer", response_model=DraftAnswerResponse)
async def save_draft_answer(
    session_id: str,
    req: DraftAnswerSubmit,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    session_result = await db.execute(
        select(QuizSession).where(QuizSession.id == session_id)
    )
    session = session_result.scalar_one_or_none()
    if not session or session.user_id != user.id:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.mode != QuizMode.exam:
        raise HTTPException(status_code=400, detail="Draft answers only for exam mode")
    if session.status not in (QuizSessionStatus.ready, QuizSessionStatus.in_progress):
        raise HTTPException(status_code=400, detail="Session is not in progress")

    existing = await db.execute(
        select(DraftAnswer).where(
            DraftAnswer.quiz_session_id == session_id,
            DraftAnswer.quiz_item_id == req.item_id,
            DraftAnswer.user_id == user.id,
        )
    )
    draft = existing.scalar_one_or_none()
    if draft:
        draft.user_answer = req.user_answer
        draft.saved_at = datetime.now(timezone.utc)
    else:
        draft = DraftAnswer(
            id=str(uuid.uuid4()),
            quiz_session_id=session_id,
            quiz_item_id=req.item_id,
            user_id=user.id,
            user_answer=req.user_answer,
        )
        db.add(draft)

    if session.status == QuizSessionStatus.ready:
        session.status = QuizSessionStatus.in_progress
        session.started_at = datetime.now(timezone.utc)

    await db.commit()
    return DraftAnswerResponse(saved_at=draft.saved_at)


@router.post("/{session_id}/submit", response_model=ExamSubmitResponse)
async def submit_exam(
    session_id: str,
    req: ExamSubmit,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    session_result = await db.execute(
        select(QuizSession).where(QuizSession.id == session_id)
    )
    session = session_result.scalar_one_or_none()
    if not session or session.user_id != user.id:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.mode != QuizMode.exam:
        raise HTTPException(status_code=400, detail="Not an exam session")
    if session.status in (
        QuizSessionStatus.submitted,
        QuizSessionStatus.grading,
        QuizSessionStatus.graded,
    ):
        return ExamSubmitResponse(status=session.status.value, job_id=None)

    if req.idempotency_key:
        if session.idempotency_key and session.idempotency_key != req.idempotency_key:
            pass
        session.idempotency_key = req.idempotency_key

    session.status = QuizSessionStatus.submitted
    session.submitted_at = datetime.now(timezone.utc)

    job = Job(
        id=str(uuid.uuid4()),
        job_type="exam_grading",
        status="pending",
        target_type="quiz_session",
        target_id=session_id,
    )
    db.add(job)

    session.status = QuizSessionStatus.grading
    await db.commit()

    celery_app.send_task("grade_exam", args=[job.id])

    return ExamSubmitResponse(status=session.status.value, job_id=job.id)
