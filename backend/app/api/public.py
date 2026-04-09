import hashlib
import os
import uuid
from datetime import datetime, timezone

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Header,
    Request,
    UploadFile,
    File as FastAPIFile,
    Form,
)
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.guest_rate_limit import guest_ip_rate_limit
from app.middleware.turnstile import verify_turnstile
from app.models.file import File, FileStatus
from app.models.guest import GuestSession
from app.models.quiz import (
    AnswerLog,
    QuizItem,
    QuizMode,
    QuizSession,
    QuizSessionFile,
    QuizSessionStatus,
    SourceMode,
)
from app.models.search import Job
from app.schemas.public import (
    PublicAnswerResponse,
    PublicAnswerSubmit,
    PublicQuizItemResponse,
    PublicQuizResults,
    PublicQuizResultItem,
    PublicQuizSessionCreate,
    PublicQuizSessionDetail,
    PublicQuizSessionResponse,
)
from app.services.guest_session_service import GuestSessionService
from app.workers.celery_app import dispatch_task

router = APIRouter()


async def get_guest_session(
    db: AsyncSession = Depends(get_db),
    x_guest_session: str = Header(..., alias="X-Guest-Session"),
) -> GuestSession:
    forwarded_for = None
    session = await GuestSessionService.get_or_create(db, x_guest_session, "unknown")
    await GuestSessionService.update_activity(db, x_guest_session)
    return session


async def get_guest_session_with_ip(
    request: Request,
    db: AsyncSession = Depends(get_db),
    x_guest_session: str = Header(..., alias="X-Guest-Session"),
) -> GuestSession:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()
    else:
        client_ip = request.client.host if request.client else "unknown"

    session = await GuestSessionService.get_or_create(db, x_guest_session, client_ip)
    await GuestSessionService.update_activity(db, x_guest_session)
    return session


def _validate_guest_owns_session(
    quiz_session: QuizSession, guest: GuestSession
) -> None:
    if quiz_session.guest_session_id != guest.id:
        raise HTTPException(status_code=404, detail="Session not found")


@router.post(
    "/quiz-sessions",
    response_model=PublicQuizSessionResponse,
    status_code=201,
)
async def create_public_quiz_session(
    req: PublicQuizSessionCreate,
    db: AsyncSession = Depends(get_db),
    guest: GuestSession = Depends(get_guest_session_with_ip),
    _rate: None = Depends(guest_ip_rate_limit),
    _turnstile: None = Depends(verify_turnstile),
):
    if not req.topic and not req.manual_text and not req.selected_file_ids:
        raise HTTPException(
            status_code=422,
            detail="주제, 텍스트, 또는 파일 중 하나는 입력해야 합니다.",
        )

    from app.config import settings as cfg

    source_mode = (
        SourceMode.document_based
        if (req.selected_file_ids or req.manual_text)
        else SourceMode.no_source
    )

    session = QuizSession(
        user_id=None,
        guest_session_id=guest.id,
        mode=QuizMode.normal,
        source_mode=source_mode,
        status=QuizSessionStatus.draft,
        difficulty=req.difficulty,
        question_count=req.question_count,
        generation_model_name=cfg.eco_generation_model,
    )
    db.add(session)
    await db.flush()

    for fid in req.selected_file_ids:
        result = await db.execute(select(File).where(File.id == fid))
        f = result.scalar_one_or_none()
        if not f or f.guest_session_id != guest.id:
            raise HTTPException(status_code=403, detail=f"File {fid} not accessible")
        db.add(QuizSessionFile(quiz_session_id=session.id, file_id=fid))

    if req.manual_text:
        file_record = File(
            user_id=None,
            guest_session_id=guest.id,
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
            "question_types": [],
            "source_mode": source_mode.value,
            "topic": req.topic,
        },
    )
    db.add(job)
    session.status = QuizSessionStatus.generating
    await db.commit()
    await db.refresh(session)

    dispatch_task("generate_quiz", [job.id])

    return PublicQuizSessionResponse(session_id=session.id, status=session.status.value)


@router.get(
    "/quiz-sessions/{session_id}",
    response_model=PublicQuizSessionDetail,
)
async def get_public_quiz_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    guest: GuestSession = Depends(get_guest_session),
):
    result = await db.execute(select(QuizSession).where(QuizSession.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _validate_guest_owns_session(session, guest)

    return PublicQuizSessionDetail(
        session_id=session.id,
        status=session.status.value,
        question_count=session.question_count,
        created_at=session.created_at,
    )


@router.get(
    "/quiz-sessions/{session_id}/items",
    response_model=list[PublicQuizItemResponse],
)
async def get_public_quiz_items(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    guest: GuestSession = Depends(get_guest_session),
):
    session_result = await db.execute(
        select(QuizSession).where(QuizSession.id == session_id)
    )
    session = session_result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _validate_guest_owns_session(session, guest)

    if session.status not in (
        QuizSessionStatus.ready,
        QuizSessionStatus.in_progress,
        QuizSessionStatus.graded,
    ):
        raise HTTPException(status_code=400, detail="Quiz is not ready yet")

    result = await db.execute(
        select(QuizItem)
        .where(QuizItem.quiz_session_id == session_id)
        .order_by(QuizItem.item_order)
    )
    items = result.scalars().all()

    return [
        PublicQuizItemResponse(
            id=i.id,
            item_order=i.item_order,
            question_type=i.question_type.value,
            question_text=i.question_text,
            options_json=i.options_json,
            difficulty=i.difficulty,
        )
        for i in items
    ]


@router.post(
    "/quiz-sessions/{session_id}/items/{item_id}/answer",
    response_model=PublicAnswerResponse,
)
async def submit_public_answer(
    session_id: str,
    item_id: str,
    req: PublicAnswerSubmit,
    db: AsyncSession = Depends(get_db),
    guest: GuestSession = Depends(get_guest_session),
):
    session_result = await db.execute(
        select(QuizSession).where(QuizSession.id == session_id)
    )
    session = session_result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _validate_guest_owns_session(session, guest)

    if session.status not in (
        QuizSessionStatus.ready,
        QuizSessionStatus.in_progress,
    ):
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
    from app.services.quiz_service import _grade_single_answer

    normalized = normalize_answer(req.user_answer)
    grading = await _grade_single_answer(
        item=item,
        user_answer=req.user_answer,
        model_name=session.generation_model_name,
        include_essay=True,
    )

    raw_correct = item.correct_answer_json
    if isinstance(raw_correct, dict):
        correct_answer = raw_correct.get("answer", str(raw_correct))
    elif isinstance(raw_correct, str):
        correct_answer = raw_correct
    else:
        correct_answer = ""

    existing_active = await db.execute(
        select(AnswerLog)
        .where(
            AnswerLog.quiz_item_id == item_id,
            AnswerLog.quiz_session_id == session_id,
            AnswerLog.guest_session_id == guest.id,
            AnswerLog.is_active_result.is_(True),
        )
        .with_for_update()
    )
    for old_log in existing_active.scalars().all():
        old_log.is_active_result = False

    answer_log = AnswerLog(
        quiz_item_id=item_id,
        quiz_session_id=session_id,
        user_id=None,
        guest_session_id=guest.id,
        user_answer_raw=req.user_answer,
        user_answer_normalized=normalized,
        judgement=grading.judgement,
        score_awarded=grading.score_awarded,
        max_score=grading.max_score,
        grading_confidence=grading.grading_confidence,
        grading_rationale=grading.grading_rationale,
        missing_points_json=grading.missing_points,
        error_type=grading.error_type,
        is_active_result=True,
        graded_at=datetime.now(timezone.utc),
    )
    db.add(answer_log)

    from app.services.quiz_service import _recalculate_session_totals

    session.total_score, session.max_score = await _recalculate_session_totals(
        db, session.id, guest_session_id=guest.id
    )


@router.get(
    "/quiz-sessions/{session_id}/results",
    response_model=PublicQuizResults,
)
async def get_public_quiz_results(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    guest: GuestSession = Depends(get_guest_session),
):
    session_result = await db.execute(
        select(QuizSession).where(QuizSession.id == session_id)
    )
    session = session_result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _validate_guest_owns_session(session, guest)

    items_result = await db.execute(
        select(QuizItem)
        .where(QuizItem.quiz_session_id == session_id)
        .order_by(QuizItem.item_order)
    )
    items = items_result.scalars().all()

    result_items = []
    for item in items:
        answer_result = await db.execute(
            select(AnswerLog).where(
                AnswerLog.quiz_item_id == item.id,
                AnswerLog.guest_session_id == guest.id,
                AnswerLog.is_active_result.is_(True),
            )
        )
        answer = answer_result.scalar_one_or_none()

        result_items.append(
            PublicQuizResultItem(
                id=item.id,
                item_order=item.item_order,
                question_type=item.question_type.value,
                question_text=item.question_text,
                options_json=item.options_json,
                correct_answer_json=item.correct_answer_json,
                explanation_text=item.explanation_text,
                user_answer=answer.user_answer_raw if answer else None,
                judgement=answer.judgement.value if answer else "skipped",
                score_awarded=answer.score_awarded if answer else 0.0,
                max_score=answer.max_score if answer else 1.0,
                grading_rationale=answer.grading_rationale if answer else None,
            )
        )

    return PublicQuizResults(
        session_id=session.id,
        total_score=session.total_score or 0.0,
        max_score=session.max_score or 0.0,
        items=result_items,
    )


GUEST_MAX_UPLOAD_SIZE_MB = 10
GUEST_MAX_FILES = 3


@router.post("/files", status_code=201)
async def upload_guest_file(
    request: Request,
    file: UploadFile | None = FastAPIFile(None),
    manual_text: str | None = Form(None),
    source_url: str | None = Form(None),
    db: AsyncSession = Depends(get_db),
    guest: GuestSession = Depends(get_guest_session_with_ip),
    _rate: None = Depends(guest_ip_rate_limit),
    _turnstile: None = Depends(verify_turnstile),
):
    from app.config import settings as cfg

    existing_count = await db.execute(
        select(func.count())
        .select_from(File)
        .where(
            File.guest_session_id == guest.id,
            File.deleted_at.is_(None),
        )
    )
    if (existing_count.scalar() or 0) >= GUEST_MAX_FILES:
        raise HTTPException(
            status_code=400,
            detail=f"게스트 세션당 최대 {GUEST_MAX_FILES}개 파일까지 업로드할 수 있습니다.",
        )

    if file:
        ext = os.path.splitext(file.filename or "")[1].lstrip(".").lower()
        if ext not in cfg.allowed_file_types.split(","):
            raise HTTPException(
                status_code=400, detail=f"지원하지 않는 파일 형식: {ext}"
            )

        max_size = GUEST_MAX_UPLOAD_SIZE_MB * 1024 * 1024
        chunks = []
        total_size = 0
        while True:
            chunk = await file.read(8192)
            if not chunk:
                break
            total_size += len(chunk)
            if total_size > max_size:
                raise HTTPException(
                    status_code=413,
                    detail=f"파일 크기가 {GUEST_MAX_UPLOAD_SIZE_MB}MB를 초과합니다.",
                )
            chunks.append(chunk)
        content = b"".join(chunks)
        content_hash = hashlib.sha256(content).hexdigest()

        stored_filename = f"{uuid.uuid4()}.{ext}"
        stored_path = f"guest/{guest.session_token}/{stored_filename}"

        from app.services import storage as _storage

        await _storage.upload_file(stored_path, content)

        file_record = File(
            user_id=None,
            guest_session_id=guest.id,
            original_filename=file.filename,
            stored_path=stored_path,
            file_type=ext,
            file_size_bytes=total_size,
            source_type="upload",
            status=FileStatus.uploaded,
            content_hash=content_hash,
        )
        db.add(file_record)
        await db.flush()

        job = Job(
            id=str(uuid.uuid4()),
            job_type="file_processing",
            status="pending",
            target_type="file",
            target_id=file_record.id,
            payload_json={},
        )
        db.add(job)
        await db.commit()

        dispatch_task("process_file", [job.id])

        return {
            "file_id": file_record.id,
            "filename": file_record.original_filename,
            "status": file_record.status.value,
        }

    elif manual_text:
        file_record = File(
            user_id=None,
            guest_session_id=guest.id,
            source_type="manual_text",
            file_type="txt",
            file_size_bytes=len(manual_text.encode("utf-8")),
            status=FileStatus.ready,
            is_searchable=True,
            is_quiz_eligible=True,
        )
        db.add(file_record)
        await db.commit()

        return {
            "file_id": file_record.id,
            "filename": "manual_text.txt",
            "status": file_record.status.value,
        }

    raise HTTPException(status_code=400, detail="파일 또는 텍스트를 제공해야 합니다.")


@router.get("/files")
async def list_guest_files(
    db: AsyncSession = Depends(get_db),
    guest: GuestSession = Depends(get_guest_session),
):
    result = await db.execute(
        select(File).where(
            File.guest_session_id == guest.id,
            File.deleted_at.is_(None),
        )
    )
    files = result.scalars().all()
    return [
        {
            "file_id": f.id,
            "filename": f.original_filename or "manual_text.txt",
            "status": f.status.value,
        }
        for f in files
    ]
