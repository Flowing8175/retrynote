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
    QuizConfigResponse,
    QuizSessionResponse,
    QuizSessionDetail,
    QuizSessionHistoryItem,
    QuizItemResponse,
    QuizItemDetail,
    AnswerSubmit,
    AnswerResponse,
    AnswerLogEntry,
    DraftAnswerSubmit,
    DraftAnswerResponse,
    ExamSubmit,
    ExamSubmitResponse,
    SessionCompleteResponse,
)
from app.models.objection import Objection, ObjectionStatus
from app.schemas.objection import ObjectionCreate, ObjectionResponse
from app.middleware.auth import get_current_user
from app.middleware.rate_limit_pro import pro_rate_limit
from app.workers.celery_app import dispatch_task
from app.services.quiz_service import _update_weak_point

router = APIRouter()


def _describe_generation_model(
    tier: str, model_name: str, default_model_name: str
) -> dict[str, str | bool]:
    return {
        "tier": tier,
        "value": model_name,
        "label": tier,
        "is_default": model_name == default_model_name,
    }


@router.get("/config", response_model=QuizConfigResponse)
async def get_quiz_config(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.config import settings as cfg
    from app.tier_config import (
        TIER_LIMITS,
        UserTier,
        MODEL_ECO,
        MODEL_BALANCED,
        MODEL_PERFORMANCE,
    )
    from app.services.usage_service import UsageService

    tier = UserTier(user.tier)
    allowed_models = TIER_LIMITS[tier].allowed_models

    default_model = cfg.eco_generation_model or cfg.openai_generation_model

    configured_tiers = [
        ("ECO", cfg.eco_generation_model),
        ("BALANCED", cfg.balanced_generation_model),
        ("PERFORMANCE", cfg.performance_generation_model),
    ]

    generation_model_options = [
        _describe_generation_model(tier_label, model_name, default_model)
        for tier_label, model_name in configured_tiers
        if model_name and tier_label in allowed_models
    ]

    usage_svc = UsageService()
    usage_status = await usage_svc.get_usage_status(db, user)
    for opt in generation_model_options:
        opt["free_trial_available"] = False
    if tier == UserTier.free and usage_status.free_trial_available:
        for tier_label, model_name in configured_tiers:
            if model_name and tier_label not in allowed_models:
                trial_opt = _describe_generation_model(
                    tier_label, model_name, default_model
                )
                trial_opt["is_trial"] = True
                trial_opt["free_trial_available"] = True
                generation_model_options.append(trial_opt)

    if not generation_model_options:
        # Fall back to raw provider defaults when no tiers are configured.
        openai_fallback = cfg.openai_generation_model
        generation_model_options = [
            _describe_generation_model("BALANCED", openai_fallback, openai_fallback),
            _describe_generation_model(
                "ECO", cfg.openai_fallback_generation_model, openai_fallback
            ),
        ]
        if cfg.gemini_generation_model:
            generation_model_options.append(
                _describe_generation_model(
                    "BALANCED",
                    cfg.gemini_generation_model,
                    cfg.gemini_generation_model,
                )
            )

    available_generation_models = [
        option["value"] for option in generation_model_options
    ]
    default_generation_model = next(
        (
            option["value"]
            for option in generation_model_options
            if option.get("is_default")
        ),
        default_model,
    )

    return {
        "default_generation_model": default_generation_model,
        "available_generation_models": available_generation_models,
        "generation_model_options": generation_model_options,
    }


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
    _rate_limit: None = Depends(pro_rate_limit),
):
    if req.idempotency_key:
        existing = await db.execute(
            select(QuizSession).where(
                QuizSession.idempotency_key == req.idempotency_key,
                QuizSession.user_id == user.id,
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
    from app.services.usage_service import UsageService
    from app.tier_config import (
        TIER_LIMITS,
        UserTier,
        MODEL_ECO,
        MODEL_BALANCED,
        MODEL_PERFORMANCE,
    )
    from app.schemas.billing import LimitExceededError
    from datetime import datetime, timezone, timedelta

    usage_svc = UsageService()
    tier = UserTier(user.tier)
    allowed_models = TIER_LIMITS[tier].allowed_models

    preferred = req.preferred_model or cfg.openai_generation_model
    model_tier_label = None
    if preferred == cfg.eco_generation_model:
        model_tier_label = MODEL_ECO
    elif preferred == cfg.balanced_generation_model:
        model_tier_label = MODEL_BALANCED
    elif preferred == cfg.performance_generation_model:
        model_tier_label = MODEL_PERFORMANCE

    if model_tier_label and model_tier_label not in allowed_models:
        # Lock the user row to prevent concurrent free trial consumption
        _user_result = await db.execute(
            select(User).where(User.id == user.id).with_for_update()
        )
        user = _user_result.scalar_one()

        now = datetime.now(timezone.utc)
        trial_ok = False
        if user.free_trial_used_at is None:
            trial_ok = True
        else:
            trial_at = user.free_trial_used_at
            if trial_at.tzinfo is None:
                trial_at = trial_at.replace(tzinfo=timezone.utc)
            trial_ok = (now - trial_at) > timedelta(days=7)

        if trial_ok:
            user.free_trial_used_at = now
        else:
            raise HTTPException(
                status_code=402,
                detail=LimitExceededError(
                    detail="이 AI 모델은 현재 요금제에서 사용할 수 없습니다.",
                    limit_type="model_access",
                    current_usage=0,
                    limit=0,
                    upgrade_url="/pricing",
                ).model_dump(),
            )

    allowed, remaining, source = await usage_svc.check_and_consume(db, user, "quiz", 1)
    if not allowed:
        raise HTTPException(
            status_code=402,
            detail=LimitExceededError(
                detail="퀴즈 생성 한도를 초과했습니다. 요금제를 업그레이드하거나 크레딧을 구매하세요.",
                limit_type="quiz",
                current_usage=TIER_LIMITS[tier].quiz_per_window,
                limit=TIER_LIMITS[tier].quiz_per_window,
                upgrade_url="/pricing",
            ).model_dump(),
        )

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
        generation_model_name=req.preferred_model or cfg.openai_generation_model,
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
            "topic": req.topic,
        },
    )
    db.add(job)
    session.status = QuizSessionStatus.generating
    job_id = job.id

    await db.commit()
    await db.refresh(session)

    await dispatch_task("generate_quiz", [job_id])

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

    item_result = await db.execute(
        select(QuizItem).where(
            QuizItem.id == item_id,
            QuizItem.quiz_session_id == session_id,
        )
    )
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
        select(AnswerLog)
        .where(
            AnswerLog.quiz_item_id == item_id,
            AnswerLog.quiz_session_id == session_id,
            AnswerLog.user_id == user.id,
            AnswerLog.is_active_result == True,
        )
        .with_for_update()
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

    await _update_weak_point(db, user.id, item, judgement)

    all_items = await db.execute(
        select(QuizItem)
        .where(QuizItem.quiz_session_id == session_id)
        .order_by(QuizItem.item_order)
    )
    items_list = all_items.scalars().all()
    next_item_id = None
    for it in items_list:
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

    await db.commit()
    await db.refresh(answer_log)

    return AnswerResponse(
        answer_log_id=answer_log.id,
        judgement=judgement.value,
        score_awarded=score_awarded,
        max_score=max_score,
        grading_confidence=grading_confidence,
        grading_rationale=grading_rationale,
        explanation=item.explanation_text,
        tips=item.tips_text,
        missing_points=missing_points,
        error_type=error_type.value if error_type else None,
        normalized_user_answer=normalized,
        suggested_feedback=suggested_feedback,
        next_item_id=next_item_id,
        correct_answer=correct_answer if judgement != Judgement.correct else None,
    )


@router.post("/{session_id}/complete", response_model=SessionCompleteResponse)
async def complete_quiz_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    session_result = await db.execute(
        select(QuizSession).where(QuizSession.id == session_id)
    )
    session = session_result.scalar_one_or_none()
    if not session or session.user_id != user.id:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.mode != QuizMode.normal:
        raise HTTPException(status_code=400, detail="Use exam submit for exam mode")
    if session.status == QuizSessionStatus.graded:
        return SessionCompleteResponse(
            status=session.status.value,
            total_score=session.total_score or 0.0,
            max_score=session.max_score or 0.0,
        )
    if session.status not in (QuizSessionStatus.ready, QuizSessionStatus.in_progress):
        raise HTTPException(
            status_code=400, detail="Session is not in a completable state"
        )

    items_result = await db.execute(
        select(QuizItem).where(QuizItem.quiz_session_id == session_id)
    )
    items = items_result.scalars().all()

    answered_result = await db.execute(
        select(AnswerLog.quiz_item_id).where(
            AnswerLog.quiz_session_id == session_id,
            AnswerLog.user_id == user.id,
            AnswerLog.is_active_result == True,
        )
    )
    answered_ids = set(answered_result.scalars().all())
    unanswered = [i for i in items if i.id not in answered_ids]
    if unanswered:
        raise HTTPException(
            status_code=400,
            detail=f"{len(unanswered)} item(s) not yet answered",
        )

    total_result = await db.execute(
        select(func.sum(AnswerLog.score_awarded), func.sum(AnswerLog.max_score)).where(
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

    return SessionCompleteResponse(
        status=session.status.value,
        total_score=session.total_score,
        max_score=session.max_score,
    )


@router.delete("/{session_id}", status_code=204)
async def delete_quiz_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(QuizSession).where(
            QuizSession.id == session_id,
            QuizSession.deleted_at.is_(None),
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.user_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    session.deleted_at = datetime.now(timezone.utc)
    await db.commit()


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

    item_check = await db.execute(
        select(QuizItem).where(
            QuizItem.id == req.item_id,
            QuizItem.quiz_session_id == session_id,
        )
    )
    if not item_check.scalar_one_or_none():
        raise HTTPException(
            status_code=404, detail="Item not found or does not belong to this session"
        )

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
    if session.status not in (QuizSessionStatus.ready, QuizSessionStatus.in_progress):
        raise HTTPException(
            status_code=400, detail="Session is not ready for submission"
        )

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

    await dispatch_task("grade_exam", [job.id])

    return ExamSubmitResponse(status=session.status.value, job_id=job.id)


@router.get("/{session_id}/answer-logs", response_model=list[AnswerLogEntry])
async def get_answer_logs(
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

    items_result = await db.execute(
        select(QuizItem).where(QuizItem.quiz_session_id == session_id)
    )
    items_map = {i.id: i for i in items_result.scalars().all()}

    logs_result = await db.execute(
        select(AnswerLog).where(
            AnswerLog.quiz_session_id == session_id,
            AnswerLog.user_id == user.id,
            AnswerLog.is_active_result == True,
        )
    )
    logs = logs_result.scalars().all()

    return [
        AnswerLogEntry(
            item_id=log.quiz_item_id,
            answer_log_id=log.id,
            user_answer=log.user_answer_raw or "",
            judgement=log.judgement.value,
            score_awarded=log.score_awarded,
            max_score=log.max_score,
            grading_confidence=log.grading_confidence,
            grading_rationale=log.grading_rationale,
            explanation=items_map[log.quiz_item_id].explanation_text
            if log.quiz_item_id in items_map
            else None,
            tips=items_map[log.quiz_item_id].tips_text
            if log.quiz_item_id in items_map
            else None,
            missing_points=log.missing_points_json,
            error_type=log.error_type.value if log.error_type else None,
            normalized_user_answer=log.user_answer_normalized,
            suggested_feedback=None,
            correct_answer=items_map[log.quiz_item_id].correct_answer_json
            if log.quiz_item_id in items_map
            else None,
        )
        for log in logs
    ]


@router.post(
    "/{session_id}/items/{item_id}/objections",
    response_model=ObjectionResponse,
)
async def create_objection(
    session_id: str,
    item_id: str,
    req: ObjectionCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    session_result = await db.execute(
        select(QuizSession).where(QuizSession.id == session_id)
    )
    session = session_result.scalar_one_or_none()
    if not session or session.user_id != user.id:
        raise HTTPException(status_code=404, detail="Session not found")

    answer_result = await db.execute(
        select(AnswerLog).where(
            AnswerLog.id == req.answer_log_id,
            AnswerLog.quiz_item_id == item_id,
            AnswerLog.user_id == user.id,
            AnswerLog.is_active_result == True,
        )
    )
    answer_log = answer_result.scalar_one_or_none()
    if not answer_log:
        raise HTTPException(status_code=404, detail="Answer log not found")

    existing = await db.execute(
        select(Objection).where(
            Objection.answer_log_id == req.answer_log_id,
            Objection.status.in_(
                [ObjectionStatus.submitted, ObjectionStatus.under_review]
            ),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=400, detail="Objection already pending for this answer"
        )

    objection = Objection(
        user_id=user.id,
        quiz_session_id=session_id,
        quiz_item_id=item_id,
        answer_log_id=req.answer_log_id,
        objection_reason=req.objection_reason,
        status=ObjectionStatus.submitted,
    )
    db.add(objection)
    await db.flush()  # populate objection.id before creating the Job

    if session.status == QuizSessionStatus.graded:
        session.status = QuizSessionStatus.objection_pending

    job = Job(
        id=str(uuid.uuid4()),
        job_type="objection_review",
        status="pending",
        target_type="objection",
        target_id=objection.id,
    )
    db.add(job)

    objection.status = ObjectionStatus.under_review
    await db.commit()
    await db.refresh(objection)

    await dispatch_task("review_objection", [job.id])

    return ObjectionResponse(objection_id=objection.id, status=objection.status.value)
