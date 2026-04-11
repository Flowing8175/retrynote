import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

from app.database import async_session
from app.models.file import File, FileStatus, ParsedDocument, DocumentChunk
from app.models.quiz import (
    QuizSession,
    QuizSessionFile,
    QuizSessionStatus,
    QuizItem,
    QuestionType,
    AnswerLog,
    Judgement,
    ErrorType,
)
from app.models.objection import Objection, ObjectionStatus, WeakPoint
from app.models.search import Job, DraftAnswer
from app.utils.normalize import normalize_answer, normalize_concept_key
from app.prompts import (
    SYSTEM_PROMPT_QUIZ_GENERATION,
    SYSTEM_PROMPT_OBJECTION_REVIEW,
)
from app.prompts.generation import build_generation_prompt
from app.prompts.retry_generation import (
    SYSTEM_PROMPT_RETRY_GENERATION,
    build_batch_retry_prompt,
)
from app.utils.ai_client import call_ai_with_fallback, OBJECTION_REVIEW_SCHEMA
from app.config import settings as cfg
import json as json_mod


async def process_file(job_id: str):
    async with async_session() as db:
        job_result = await db.execute(select(Job).where(Job.id == job_id))
        job = job_result.scalar_one_or_none()
        if not job:
            return

        job.status = "processing"
        job.started_at = datetime.now(timezone.utc)
        await db.commit()

        file_result = await db.execute(select(File).where(File.id == job.target_id))
        file = file_result.scalar_one_or_none()
        if not file:
            job.status = "failed"
            job.error_message = "File not found"
            await db.commit()
            return

        try:
            file.status = FileStatus.parsing
            file.processing_started_at = datetime.now(timezone.utc)
            await db.commit()

            ocr_required = file.file_type in ("png", "jpg", "jpeg")
            text = ""

            if ocr_required:
                file.ocr_required = True
                file.status = FileStatus.ocr_pending
                await db.commit()

                file.status = FileStatus.ocr_processing
                await db.commit()

                from app.services.ocr_service import extract_text_from_image
                from app.services import storage as _storage

                stored_path = file.stored_path
                if not stored_path:
                    raise ValueError("Image file missing stored_path")
                image_data = await _storage.download_file(stored_path)
                ocr_result = await extract_text_from_image(image_data)
                text = ocr_result.text
            elif file.source_type.value == "manual_text":
                payload = job.payload_json or {}
                text = payload.get("manual_text", "")
            elif file.source_type.value == "upload":
                text = await _extract_file_text_async(file)
            elif file.source_type.value == "url":
                if not file.source_url:
                    raise ValueError("URL source missing source_url")
                text = await _fetch_url_text(file.source_url)

            file.status = FileStatus.parsed
            await db.commit()

            if not text.strip():
                if ocr_required:
                    file.status = FileStatus.failed_partial
                    file.parse_error_code = "ocr_empty"
                else:
                    file.status = FileStatus.failed_terminal
                    file.parse_error_code = "empty_content"
                file.processing_finished_at = datetime.now(timezone.utc)
                job.status = "failed"
                job.error_message = "File content is empty"
                job.finished_at = datetime.now(timezone.utc)
                await db.commit()
                return

            normalized = _normalize_text(text)

            parsed_doc = ParsedDocument(
                file_id=file.id,
                raw_text=text,
                normalized_text=normalized,
                language="ko",
                page_count=1,
                parser_name="kakao_ocr" if ocr_required else "builtin",
                parser_version="1.0",
                ocr_applied=ocr_required,
            )
            db.add(parsed_doc)
            await db.flush()

            file.status = FileStatus.embedding_pending
            await db.commit()

            chunks = _create_chunks(file.id, parsed_doc.id, normalized)
            db.add_all(chunks)
            await db.flush()

            for chunk in chunks:
                chunk.embedding_status = "completed"
            logger.warning(
                "File %s: embedding_status set to 'completed' without actual embedding — "
                "vector search will not work for this file until embeddings are generated",
                file.id,
            )

            file.status = FileStatus.ready
            file.is_searchable = True
            file.is_quiz_eligible = True
            file.processing_finished_at = datetime.now(timezone.utc)

            job.status = "completed"
            job.finished_at = datetime.now(timezone.utc)
            await db.commit()

        except Exception as e:
            is_ocr_failure = file.ocr_required and file.status in (
                FileStatus.ocr_pending,
                FileStatus.ocr_processing,
            )
            file.status = (
                FileStatus.failed_partial
                if is_ocr_failure
                else FileStatus.failed_terminal
            )
            file.parse_error_code = str(e)[:200]
            file.processing_finished_at = datetime.now(timezone.utc)
            job.status = "failed"
            job.error_message = str(e)
            await db.commit()


async def _extract_file_text_async(file: File) -> str:
    if not file.stored_path:
        return ""

    from app.services import storage as _storage

    try:
        data = await _storage.download_file(file.stored_path)
    except Exception:
        return ""

    ext = file.file_type
    if ext == "pdf":
        return _extract_pdf_bytes(data)
    elif ext == "docx":
        return _extract_docx_bytes(data)
    elif ext == "pptx":
        return _extract_pptx_bytes(data)
    elif ext in ("txt", "md"):
        return data.decode("utf-8", errors="replace")
    return ""


def _extract_pdf_bytes(data: bytes) -> str:
    try:
        import io
        from PyPDF2 import PdfReader

        reader = PdfReader(io.BytesIO(data))
        return "".join(page.extract_text() or "" for page in reader.pages)
    except Exception:
        return ""


def _extract_docx_bytes(data: bytes) -> str:
    try:
        import io
        from docx import Document

        doc = Document(io.BytesIO(data))
        return "\n".join(p.text for p in doc.paragraphs if p.text)
    except Exception:
        return ""


def _extract_pptx_bytes(data: bytes) -> str:
    try:
        import io
        from pptx import Presentation

        prs = Presentation(io.BytesIO(data))
        text = ""
        for slide in prs.slides:
            for shape in slide.shapes:
                if shape.has_text_frame:
                    for para in shape.text_frame.paragraphs:
                        text += para.text + "\n"
        return text
    except Exception:
        return ""


def _validate_ip(addr: str) -> bool:
    """Check if a resolved IP address is safe (not private/internal)."""
    import ipaddress

    try:
        ip = ipaddress.ip_address(addr)
        return not (
            ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved
        )
    except ValueError:
        return False


def _resolve_and_validate_url(url: str) -> tuple[str, str, int] | None:
    """Resolve URL hostname and validate the resolved IP is safe.

    Returns (resolved_ip, hostname, port) or None if unsafe.
    Resolves DNS exactly once to prevent TOCTOU / DNS rebinding attacks.
    """
    from urllib.parse import urlparse
    import socket

    try:
        parsed = urlparse(url)
    except Exception:
        return None

    if parsed.scheme not in ("http", "https"):
        return None

    hostname = parsed.hostname
    if not hostname:
        return None

    blocked_hosts = {
        "localhost",
        "127.0.0.1",
        "0.0.0.0",
        "::1",
        "metadata.google.internal",
        "169.254.169.254",
    }
    if hostname.lower() in blocked_hosts:
        return None

    port = parsed.port or (443 if parsed.scheme == "https" else 80)

    # Resolve DNS exactly once and validate ALL resolved addresses
    try:
        addr_infos = socket.getaddrinfo(hostname, port, proto=socket.IPPROTO_TCP)
        if not addr_infos:
            return None
        for info in addr_infos:
            addr = str(info[4][0])
            if not _validate_ip(addr):
                return None
        resolved_ip = str(addr_infos[0][4][0])
        return resolved_ip, hostname, port
    except socket.gaierror:
        return None


async def _fetch_url_text(url: str) -> str:
    resolution = _resolve_and_validate_url(url)
    if not resolution:
        return ""
    resolved_ip, hostname, port = resolution
    try:
        import httpx
        from urllib.parse import urlparse, urlunparse

        # Rewrite URL to use the resolved IP directly, preventing DNS rebinding
        parsed = urlparse(url)
        ip_url = urlunparse(
            (
                parsed.scheme,
                f"{resolved_ip}:{port}",
                parsed.path,
                parsed.params,
                parsed.query,
                parsed.fragment,
            )
        )

        MAX_FETCH_BYTES = 5 * 1024 * 1024  # 5 MB
        async with httpx.AsyncClient() as client:
            try:
                async with client.stream(
                    "GET",
                    ip_url,
                    headers={"Host": hostname},
                    follow_redirects=False,
                    timeout=30,
                ) as resp:
                    if resp.status_code != 200:
                        return ""
                    body = b""
                    async for chunk in resp.aiter_bytes(chunk_size=8192):
                        body += chunk
                        if len(body) > MAX_FETCH_BYTES:
                            return ""
                from bs4 import BeautifulSoup

                soup = BeautifulSoup(
                    body.decode("utf-8", errors="replace"), "html.parser"
                )
                for tag in soup(["script", "style", "nav", "footer"]):
                    tag.decompose()
                return soup.get_text(separator="\n")
            except Exception:
                return ""
    except Exception:
        return ""


def _normalize_text(text: str) -> str:
    import re

    text = re.sub(r"[\r\n]+", "\n", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _create_chunks(
    file_id: str,
    parsed_doc_id: str,
    text: str,
    chunk_size: int = 500,
    overlap: int = 50,
) -> list:
    words = text.split()
    chunks = []
    chunk_index = 0
    i = 0

    while i < len(words):
        chunk_words = words[i : i + chunk_size]
        chunks.append(
            DocumentChunk(
                file_id=file_id,
                parsed_document_id=parsed_doc_id,
                chunk_index=chunk_index,
                text=" ".join(chunk_words),
                token_count=len(chunk_words),
                embedding_status="pending",
                is_active=True,
            )
        )
        chunk_index += 1
        i += chunk_size - overlap

    return chunks


async def _recalculate_session_totals(
    db: AsyncSession,
    session_id: str,
    user_id: str | None = None,
    guest_session_id: str | None = None,
) -> tuple[float, float]:
    """Recompute total_score and max_score for a session from active AnswerLogs."""
    conditions = [
        AnswerLog.quiz_session_id == session_id,
        AnswerLog.is_active_result.is_(True),
    ]
    if user_id:
        conditions.append(AnswerLog.user_id == user_id)
    elif guest_session_id:
        conditions.append(AnswerLog.guest_session_id == guest_session_id)

    score_agg = await db.execute(
        select(
            func.sum(AnswerLog.score_awarded),
            func.sum(AnswerLog.max_score),
        ).where(*conditions)
    )
    row = score_agg.one()
    return float(row[0] or 0.0), float(row[1] or 0.0)


@dataclass
class GradingResult:
    judgement: Judgement
    score_awarded: float
    max_score: float = 1.0
    grading_confidence: float = 1.0
    grading_rationale: str = ""
    error_type: "ErrorType | None" = None
    missing_points: "list | None" = None
    suggested_feedback: str = ""


async def _grade_single_answer(
    *,
    item: "QuizItem",
    user_answer: str,
    model_name: "str | None" = None,
    include_essay: bool = False,
) -> GradingResult:
    """Grade a single answer against a quiz item. Pure logic, no DB side-effects.

    - MC/OX: exact match against normalized correct answer.
    - short_answer/fill_blank: exact match first, AI fallback.
    - essay (only when include_essay=True): AI grading with essay prompt.

    Uses SYSTEM_PROMPT_GRADING_SHORT for short/fill_blank AI fallback.
    Uses SYSTEM_PROMPT_GRADING_ESSAY for essay.
    """
    from app.utils.ai_client import call_ai_with_fallback, GRADING_SCHEMA
    from app.config import settings as cfg
    from app.prompts.grading_short import SYSTEM_PROMPT_GRADING_SHORT
    import json as json_mod

    raw_correct = item.correct_answer_json
    if isinstance(raw_correct, dict):
        correct_answer = raw_correct
    elif isinstance(raw_correct, str):
        correct_answer = {"answer": raw_correct}
    else:
        correct_answer = {}

    normalized = normalize_answer(user_answer)
    primary = model_name or cfg.balanced_generation_model
    fallback = cfg.eco_generation_model

    # --- MC / OX: exact match ---
    if item.question_type in (QuestionType.multiple_choice, QuestionType.ox):
        correct_val = normalize_answer(str(correct_answer.get("answer", "")))
        if normalized == correct_val:
            return GradingResult(
                judgement=Judgement.correct,
                score_awarded=1.0,
                error_type=None,
            )
        return GradingResult(
            judgement=Judgement.incorrect,
            score_awarded=0.0,
            error_type=ErrorType.careless_mistake,
        )

    # --- short_answer / fill_blank: try exact match, then AI ---
    if item.question_type in (QuestionType.short_answer, QuestionType.fill_blank):
        accepted = correct_answer.get(
            "accepted_answers", [correct_answer.get("answer", "")]
        )
        for ans in accepted:
            if normalize_answer(str(ans)) == normalized:
                return GradingResult(judgement=Judgement.correct, score_awarded=1.0)
        # AI fallback
        try:
            prompt = (
                f"채점할 답안:\n"
                f"문제: {item.question_text}\n"
                f"정답: {json_mod.dumps(correct_answer, ensure_ascii=False)}\n"
                f"사용자 답: {user_answer}\n"
                f"정규화된 답: {normalized}\n\n"
                f"다음 필드를 포함한 JSON으로 응답하세요:\n"
                f"judgement, score_awarded, max_score, normalized_user_answer, "
                f"accepted_answers, grading_confidence, grading_rationale, "
                f"missing_points, error_type, suggested_feedback"
            )
            ai = await call_ai_with_fallback(
                prompt,
                GRADING_SCHEMA,
                primary_model=primary,
                fallback_model=fallback,
                system_message=SYSTEM_PROMPT_GRADING_SHORT,
                cache_key="grading_short_v1",
            )
            return GradingResult(
                judgement=Judgement(ai["judgement"]),
                score_awarded=ai["score_awarded"],
                max_score=ai.get("max_score", 1.0),
                grading_confidence=ai.get("grading_confidence", 0.7),
                grading_rationale=ai.get("grading_rationale", ""),
                error_type=ErrorType(ai["error_type"])
                if ai.get("error_type")
                else None,
                missing_points=ai.get("missing_points"),
                suggested_feedback=ai.get("suggested_feedback", ""),
            )
        except Exception:
            return GradingResult(judgement=Judgement.incorrect, score_awarded=0.0)

    # --- essay: AI grading (only if include_essay=True) ---
    if item.question_type == QuestionType.essay and include_essay:
        try:
            from app.prompts.grading_essay import SYSTEM_PROMPT_GRADING_ESSAY

            prompt = (
                f"채점할 서술형 답안:\n"
                f"문제: {item.question_text}\n"
                f"모범 답안: {json_mod.dumps(correct_answer, ensure_ascii=False)}\n"
                f"사용자 답: {user_answer}\n"
                f"출처 참조: {json_mod.dumps(item.source_refs_json or {}, ensure_ascii=False)}\n\n"
                f"다음 필드를 포함한 JSON으로 응답하세요:\n"
                f"judgement, score_awarded, max_score, normalized_user_answer, "
                f"accepted_answers, grading_confidence, grading_rationale, "
                f"missing_points, error_type, suggested_feedback"
            )
            ai = await call_ai_with_fallback(
                prompt,
                GRADING_SCHEMA,
                primary_model=primary,
                fallback_model=fallback,
                system_message=SYSTEM_PROMPT_GRADING_ESSAY,
                cache_key="grading_essay_v1",
            )
            return GradingResult(
                judgement=Judgement(ai["judgement"]),
                score_awarded=ai["score_awarded"],
                max_score=ai.get("max_score", 1.0),
                grading_confidence=ai.get("grading_confidence", 0.7),
                grading_rationale=ai.get("grading_rationale", ""),
                error_type=ErrorType(ai["error_type"])
                if ai.get("error_type")
                else None,
                missing_points=ai.get("missing_points"),
                suggested_feedback=ai.get("suggested_feedback", ""),
            )
        except Exception:
            return GradingResult(judgement=Judgement.incorrect, score_awarded=0.0)

    # Fallback for unhandled types
    return GradingResult(judgement=Judgement.incorrect, score_awarded=0.0)


async def generate_quiz(job_id: str):
    async with async_session() as db:
        job_result = await db.execute(select(Job).where(Job.id == job_id))
        job = job_result.scalar_one_or_none()
        if not job:
            return

        job.status = "processing"
        job.started_at = datetime.now(timezone.utc)
        await db.commit()

        session_result = await db.execute(
            select(QuizSession).where(QuizSession.id == job.target_id)
        )
        session = session_result.scalar_one_or_none()
        if not session:
            job.status = "failed"
            job.error_message = "Session not found"
            await db.commit()
            return

        try:
            session.status = QuizSessionStatus.generating
            await db.commit()

            from app.utils.ai_client import (
                call_ai_with_fallback,
                GENERATION_SCHEMA,
                BATCH_RETRY_GENERATION_SCHEMA,
            )
            from app.config import settings as cfg

            payload = job.payload_json or {}

            # Handle retry generation
            if job.job_type == "retry_generation":
                concept_keys = payload.get("concept_keys", [])
                question_count = payload.get("size", session.question_count)

                if not concept_keys:
                    session.status = QuizSessionStatus.generation_failed
                    job.status = "failed"
                    job.error_message = "No concept keys provided for retry"
                    await db.commit()
                    return

                items_created = 0

                # Phase 1: sequential DB reads to collect context per concept
                tasks_data = []  # (idx, concept_key, quiz_item)
                batch_items = []  # dicts for build_batch_retry_prompt
                for idx, concept_key in enumerate(concept_keys):
                    if question_count is not None and idx >= question_count:
                        break

                    wrong_result = await db.execute(
                        select(AnswerLog, QuizItem)
                        .join(QuizItem, QuizItem.id == AnswerLog.quiz_item_id)
                        .where(
                            AnswerLog.user_id == session.user_id,
                            QuizItem.concept_key == concept_key,
                            AnswerLog.judgement.in_(
                                [Judgement.incorrect, Judgement.partial]
                            ),
                        )
                        .order_by(AnswerLog.created_at.desc())
                        .limit(1)
                    )
                    row = wrong_result.first()
                    if not row:
                        continue

                    answer_log, quiz_item = row
                    tasks_data.append((idx, concept_key, quiz_item))
                    batch_items.append(
                        {
                            "concept_key": concept_key,
                            "concept_label": quiz_item.concept_label or concept_key,
                            "previous_question_type": quiz_item.question_type.value,
                            "previous_question": quiz_item.question_text,
                            "error_type": answer_log.error_type.value
                            if answer_log.error_type
                            else "unknown",
                            "user_answer": answer_log.user_answer_raw or "",
                            "correct_answer": str(
                                quiz_item.correct_answer_json.get("answer", "")
                                if isinstance(quiz_item.correct_answer_json, dict)
                                else quiz_item.correct_answer_json
                            ),
                            "retry_count": 1,
                        }
                    )

                if not batch_items:
                    session.status = QuizSessionStatus.generation_failed
                    job.status = "failed"
                    job.error_message = "No retry questions could be generated"
                    await db.commit()
                    return

                # Phase 2: single batched AI call for all concepts
                batch_prompt = build_batch_retry_prompt(batch_items)
                batch_result = await call_ai_with_fallback(
                    batch_prompt,
                    BATCH_RETRY_GENERATION_SCHEMA,
                    primary_model=session.generation_model_name
                    or cfg.balanced_generation_model,
                    fallback_model=cfg.eco_generation_model,
                    system_message=SYSTEM_PROMPT_RETRY_GENERATION,
                    cache_key="retry_gen_v1",
                    cache_retention="24h",
                )

                # Phase 3: match results by concept_key and insert
                result_by_concept = {
                    q["concept_key"]: q
                    for q in batch_result.get("questions", [])
                    if q.get("concept_key")
                }
                for idx, concept_key, quiz_item in tasks_data:
                    ai_result = result_by_concept.get(concept_key)
                    if not ai_result or not ai_result.get("question_text"):
                        logger.warning(
                            "Retry generation: no AI result for concept_key=%r in session %s; skipping",
                            concept_key,
                            session.id,
                        )
                        continue
                    new_item = QuizItem(
                        quiz_session_id=session.id,
                        item_order=idx + 1,
                        question_type=QuestionType(
                            ai_result.get("question_type", "multiple_choice")
                        ),
                        question_text=ai_result.get("question_text", ""),
                        correct_answer_json=ai_result.get(
                            "correct_answer", {"answer": ""}
                        ),
                        explanation_text=ai_result.get("explanation", ""),
                        concept_key=concept_key,
                        concept_label=quiz_item.concept_label,
                        category_tag=quiz_item.category_tag,
                        difficulty=quiz_item.difficulty or "medium",
                        source_refs_json=None,
                        options_json=ai_result.get("options"),
                    )
                    db.add(new_item)
                    items_created += 1

                if items_created == 0:
                    session.status = QuizSessionStatus.generation_failed
                    job.status = "failed"
                    job.error_message = "No retry questions could be generated"
                    await db.commit()
                    return

                await db.commit()
                session.status = QuizSessionStatus.ready
                job.status = "completed"
                job.finished_at = datetime.now(timezone.utc)
                await db.commit()
                return

            # Normal generation flow continues below
            source_texts = []
            if session.source_mode.value == "document_based":
                file_results = await db.execute(
                    select(File)
                    .join(QuizSessionFile, QuizSessionFile.file_id == File.id)
                    .where(QuizSessionFile.quiz_session_id == session.id)
                )
                for f in file_results.scalars().all():
                    if f.parsed_document:
                        source_texts.append(f.parsed_document.normalized_text or "")

            question_count = payload.get("question_count", session.question_count)
            difficulty = payload.get("difficulty", session.difficulty)
            question_types = payload.get("question_types", []) or [
                "multiple_choice",
                "ox",
                "short_answer",
                "fill_blank",
                "essay",
            ]

            concept_counts = {}
            if session.user_id:
                recent_concepts_result = await db.execute(
                    select(QuizItem.concept_key)
                    .join(QuizSession, QuizSession.id == QuizItem.quiz_session_id)
                    .where(QuizSession.user_id == session.user_id)
                    .order_by(QuizItem.created_at.desc())
                    .limit(20)
                )
                recent_concepts = [r[0] for r in recent_concepts_result.all() if r[0]]
                for c in recent_concepts:
                    concept_counts[c] = concept_counts.get(c, 0) + 1

            source_context = (
                "\n\n".join(source_texts[:3])
                if source_texts
                else "No source material provided."
            )
            if not source_texts and session.source_mode.value == "document_based":
                session.status = QuizSessionStatus.generation_failed
                job.status = "failed"
                job.error_message = "No source material available"
                await db.commit()
                return

            is_no_source = session.source_mode.value == "no_source"
            topic = payload.get("topic") or None
            prompt = build_generation_prompt(
                source_context=source_context,
                question_count=question_count,
                difficulty=difficulty,
                question_types=question_types,
                concept_counts=concept_counts,
                is_no_source=is_no_source,
                topic=topic,
            )

            ai_result = await call_ai_with_fallback(
                prompt,
                GENERATION_SCHEMA,
                primary_model=session.generation_model_name
                or cfg.balanced_generation_model,
                fallback_model=cfg.eco_generation_model,
                system_message=SYSTEM_PROMPT_QUIZ_GENERATION,
                cache_key="quiz_gen_v1",
                cache_retention="24h",
            )

            if ai_result.get("rejected"):
                session.status = QuizSessionStatus.generation_failed
                job.status = "failed"
                job.error_message = "INVALID_INPUT:" + ai_result.get(
                    "rejection_reason", "퀴즈를 만들기 어려운 입력입니다. 학습하고 싶은 주제나 자료를 입력해 주세요."
                )
                await db.commit()
                return

            all_questions = ai_result.get("questions", [])
            questions = (
                all_questions
                if question_count is None
                else all_questions[:question_count]
            )
            if not questions:
                session.status = QuizSessionStatus.generation_failed
                job.status = "failed"
                job.error_message = "AI returned no questions"
                await db.commit()
                return

            if question_count is None:
                session.question_count = len(questions)

            for i, q in enumerate(questions):
                item = QuizItem(
                    quiz_session_id=session.id,
                    item_order=i + 1,
                    question_type=QuestionType(
                        q.get("question_type", "multiple_choice")
                    ),
                    question_text=q.get("question_text", ""),
                    options_json=q.get("options"),
                    correct_answer_json=q.get("correct_answer"),
                    explanation_text=q.get("explanation", ""),
                    source_refs_json={"refs": q.get("source_refs", [])},
                    concept_key=q.get("concept_key", ""),
                    concept_label=q.get("concept_label", ""),
                    category_tag=q.get("category_tag", ""),
                    difficulty=q.get("difficulty", difficulty),
                    similarity_fingerprint=q.get("concept_key", ""),
                )
                db.add(item)

            session.status = QuizSessionStatus.ready
            job.status = "completed"
            job.finished_at = datetime.now(timezone.utc)
            await db.commit()

        except Exception as e:
            session.status = QuizSessionStatus.generation_failed
            job.status = "failed"
            job.error_message = str(e)
            await db.commit()


async def grade_exam(job_id: str):
    async with async_session() as db:
        job_result = await db.execute(select(Job).where(Job.id == job_id))
        job = job_result.scalar_one_or_none()
        if not job:
            return

        job.status = "processing"
        job.started_at = datetime.now(timezone.utc)
        await db.commit()

        session_result = await db.execute(
            select(QuizSession).where(QuizSession.id == job.target_id)
        )
        session = session_result.scalar_one_or_none()
        if not session:
            job.status = "failed"
            await db.commit()
            return

        try:
            session.status = QuizSessionStatus.grading
            await db.commit()

            items_result = await db.execute(
                select(QuizItem)
                .where(QuizItem.quiz_session_id == session.id)
                .order_by(QuizItem.item_order)
            )
            items = items_result.scalars().all()

            for item in items:
                draft_result = await db.execute(
                    select(DraftAnswer).where(
                        DraftAnswer.quiz_item_id == item.id,
                        DraftAnswer.quiz_session_id == session.id,
                        DraftAnswer.user_id == session.user_id,
                    )
                )
                draft = draft_result.scalar_one_or_none()
                user_answer = draft.user_answer if draft else ""

                if not user_answer:
                    grading = GradingResult(
                        judgement=Judgement.skipped,
                        score_awarded=0.0,
                        error_type=ErrorType.no_response,
                    )
                else:
                    grading = await _grade_single_answer(
                        item=item,
                        user_answer=user_answer,
                        model_name=session.generation_model_name,
                        include_essay=False,
                    )

                existing = await db.execute(
                    select(AnswerLog).where(
                        AnswerLog.quiz_item_id == item.id,
                        AnswerLog.user_id == session.user_id,
                        AnswerLog.is_active_result.is_(True),
                    )
                )
                for old_log in existing.scalars().all():
                    old_log.is_active_result = False

                answer_log = AnswerLog(
                    quiz_item_id=item.id,
                    quiz_session_id=session.id,
                    user_id=session.user_id,
                    user_answer_raw=user_answer,
                    user_answer_normalized=normalize_answer(user_answer)
                    if user_answer
                    else "",
                    judgement=grading.judgement,
                    score_awarded=grading.score_awarded,
                    max_score=grading.max_score,
                    grading_confidence=grading.grading_confidence,
                    error_type=grading.error_type,
                    is_active_result=True,
                    graded_at=datetime.now(timezone.utc),
                )
                db.add(answer_log)

                if session.user_id:
                    await _update_weak_point(
                        db, session.user_id, item, grading.judgement
                    )

            await db.flush()
            session.total_score, session.max_score = await _recalculate_session_totals(
                db, session.id, user_id=session.user_id
            )
            session.graded_at = datetime.now(timezone.utc)
            session.status = QuizSessionStatus.graded

            job.status = "completed"
            job.finished_at = datetime.now(timezone.utc)
            await db.commit()

        except Exception as e:
            session.status = QuizSessionStatus.submitted
            job.status = "failed"
            job.error_message = str(e)
            await db.commit()


async def _apply_objection_decision(
    db: AsyncSession,
    objection: "Objection",
    answer_log: "AnswerLog",
    quiz_item: "QuizItem",
    ai_result: dict,
) -> None:
    """Apply the AI objection decision.

    If upheld/partially_upheld and should_apply:
      - Deactivate old answer log
      - Create new AnswerLog with updated scores
      - Recalculate session totals
      - Set objection status to 'applied'
      - Set session status to 'regraded'

    If rejected/other:
      - Set objection status
      - If session has no remaining pending objections → restore to 'graded'
    """
    decision = ai_result.get("decision", "rejected")
    if ai_result.get("should_apply") and decision in ("upheld", "partially_upheld"):
        answer_log.is_active_result = False
        new_log = AnswerLog(
            quiz_item_id=objection.quiz_item_id,
            quiz_session_id=objection.quiz_session_id,
            user_id=objection.user_id,
            user_answer_raw=answer_log.user_answer_raw,
            user_answer_normalized=answer_log.user_answer_normalized,
            judgement=Judgement(ai_result["updated_judgement"]),
            score_awarded=ai_result["updated_score_awarded"],
            max_score=answer_log.max_score,
            grading_confidence=0.9,
            grading_rationale=ai_result.get("reasoning", ""),
            error_type=ErrorType(ai_result["updated_error_type"])
            if ai_result.get("updated_error_type")
            else None,
            is_active_result=True,
            regraded_from_answer_log_id=answer_log.id,
            graded_at=datetime.now(timezone.utc),
        )
        db.add(new_log)
        await db.flush()

        session_result = await db.execute(
            select(QuizSession).where(QuizSession.id == objection.quiz_session_id)
        )
        session = session_result.scalar_one_or_none()
        if session:
            session.total_score, session.max_score = await _recalculate_session_totals(
                db, objection.quiz_session_id, objection.user_id
            )
            objection.status = ObjectionStatus.applied
            session.status = QuizSessionStatus.regraded
    else:
        objection.status = (
            ObjectionStatus.rejected
            if decision == "rejected"
            else ObjectionStatus(decision)
        )
        await _restore_session_if_no_pending_objections(db, objection)


async def _restore_session_if_no_pending_objections(
    db: AsyncSession,
    objection: "Objection",
) -> None:
    """If no other pending objections for this session, restore session to 'graded'."""
    session_result = await db.execute(
        select(QuizSession).where(QuizSession.id == objection.quiz_session_id)
    )
    session = session_result.scalar_one_or_none()
    if session and session.status == QuizSessionStatus.objection_pending:
        remaining_result = await db.execute(
            select(Objection).where(
                Objection.quiz_session_id == objection.quiz_session_id,
                Objection.id != objection.id,
                Objection.status.in_(
                    [ObjectionStatus.submitted, ObjectionStatus.under_review]
                ),
            )
        )
        if not remaining_result.scalar_one_or_none():
            session.status = QuizSessionStatus.graded


async def review_objection(job_id: str):
    async with async_session() as db:
        job = (
            await db.execute(select(Job).where(Job.id == job_id))
        ).scalar_one_or_none()
        if not job:
            return
        objection = (
            await db.execute(select(Objection).where(Objection.id == job.target_id))
        ).scalar_one_or_none()
        if not objection:
            job.status = "failed"
            await db.commit()
            return
        job.status = "processing"
        await db.commit()
        try:
            answer_log = (
                await db.execute(
                    select(AnswerLog).where(AnswerLog.id == objection.answer_log_id)
                )
            ).scalar_one_or_none()
            quiz_item = (
                await db.execute(
                    select(QuizItem).where(QuizItem.id == objection.quiz_item_id)
                )
            ).scalar_one_or_none()
            if not answer_log or not quiz_item:
                objection.status = ObjectionStatus.rejected
                job.status = "completed"
                await db.commit()
                return
            prompt = f"""이의제기를 검토하세요.

원문 문제: {quiz_item.question_text}
정답: {json_mod.dumps(quiz_item.correct_answer_json or {}, ensure_ascii=False)}
사용자 답: {answer_log.user_answer_raw}
원래 판정: {answer_log.judgement.value}
원래 점수: {answer_log.score_awarded}
이의 사유: {objection.objection_reason}

다음 필드를 포함한 JSON으로 응답하세요:
decision, reasoning, updated_judgement, updated_score_awarded, updated_error_type, should_apply"""
            ai_result = await call_ai_with_fallback(
                prompt,
                OBJECTION_REVIEW_SCHEMA,
                primary_model=cfg.balanced_generation_model,
                fallback_model=cfg.eco_generation_model,
                system_message=SYSTEM_PROMPT_OBJECTION_REVIEW,
                cache_key="objection_v1",
            )
            objection.review_result_json = ai_result
            objection.decided_at = datetime.now(timezone.utc)
            objection.decided_by = "ai"
            await _apply_objection_decision(
                db, objection, answer_log, quiz_item, ai_result
            )
            job.status = "completed"
            job.finished_at = datetime.now(timezone.utc)
            await db.commit()
        except Exception as e:
            job.status = "failed"
            job.error_message = str(e)
            await db.commit()


async def _update_weak_point(
    db: AsyncSession, user_id: str, item: QuizItem, judgement: Judgement
):
    concept_key = normalize_concept_key(item.concept_key or "")
    if not concept_key:
        return

    result = await db.execute(
        select(WeakPoint).where(
            WeakPoint.user_id == user_id,
            WeakPoint.concept_key == concept_key,
        )
    )
    weak = result.scalar_one_or_none()

    if not weak:
        weak = WeakPoint(
            user_id=user_id,
            concept_key=concept_key,
            concept_label=item.concept_label,
            category_tag=item.category_tag,
        )
        db.add(weak)
        await db.flush()

    if judgement == Judgement.incorrect:
        weak.wrong_count += 1
        weak.streak_wrong_count += 1
        weak.last_wrong_at = datetime.now(timezone.utc)
    elif judgement == Judgement.partial:
        weak.partial_count += 1
        weak.streak_wrong_count = 0
    elif judgement == Judgement.skipped:
        weak.skip_count += 1
    elif judgement == Judgement.correct:
        weak.streak_wrong_count = 0

    await db.flush()


async def admin_regrade(job_id: str) -> None:
    """Regrade all active answer logs for a quiz item across all users.

    Uses _grade_single_answer for grading and _recalculate_session_totals
    to update session scores after regrading.
    """
    from app.models.search import Job

    async with async_session() as db:
        result = await db.execute(select(Job).where(Job.id == job_id))
        job = result.scalar_one_or_none()
        if not job:
            logger.error("admin_regrade: job %s not found", job_id)
            return

        item_result = await db.execute(
            select(QuizItem).where(QuizItem.id == job.target_id)
        )
        item = item_result.scalar_one_or_none()
        if not item:
            logger.error("admin_regrade: quiz item %s not found", job.target_id)
            job.status = "failed"
            await db.commit()
            return

        logs_result = await db.execute(
            select(AnswerLog, QuizSession)
            .join(QuizSession, QuizSession.id == AnswerLog.quiz_session_id)
            .where(
                AnswerLog.quiz_item_id == item.id,
                AnswerLog.is_active_result.is_(True),
            )
        )
        rows = logs_result.all()

        for answer_log, session in rows:
            try:
                user_answer = answer_log.user_answer_raw or ""
                grading = (
                    await _grade_single_answer(
                        item=item,
                        user_answer=user_answer,
                        model_name=session.generation_model_name,
                        include_essay=False,
                    )
                    if user_answer
                    else GradingResult(
                        judgement=Judgement.skipped,
                        score_awarded=0.0,
                        error_type=ErrorType.no_response,
                    )
                )
                answer_log.judgement = grading.judgement
                answer_log.score_awarded = grading.score_awarded
                answer_log.graded_at = datetime.now(timezone.utc)
            except Exception as exc:
                logger.warning(
                    "admin_regrade: failed to regrade log %s: %s",
                    answer_log.id,
                    exc,
                )

        await db.flush()

        affected_session_ids = {row[1].id for row in rows}
        for sid in affected_session_ids:
            sess_upd = await db.execute(
                select(QuizSession).where(QuizSession.id == sid)
            )
            sess_obj = sess_upd.scalar_one_or_none()
            if sess_obj:
                # Get the user_id for session total recalculation
                # Use the first answer_log for this session to get user_id
                user_id_for_session = next(
                    (row[0].user_id for row in rows if row[1].id == sid),
                    None,
                )
                if user_id_for_session:
                    (
                        sess_obj.total_score,
                        sess_obj.max_score,
                    ) = await _recalculate_session_totals(db, sid, user_id_for_session)

        job.status = "completed"
        job.finished_at = datetime.now(timezone.utc)
        await db.commit()
