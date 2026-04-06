import os
import json
import uuid
from datetime import datetime, timezone
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
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
    SYSTEM_PROMPT_GRADING_SHORT,
    SYSTEM_PROMPT_OBJECTION_REVIEW,
)
from app.prompts.generation import build_generation_prompt
from app.prompts.retry_generation import (
    SYSTEM_PROMPT_RETRY_GENERATION,
    build_batch_retry_prompt,
)


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

            text = ""
            if file.source_type.value == "manual_text":
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
                file.status = FileStatus.failed_terminal
                file.parse_error_code = "empty_content"
                file.processing_finished_at = datetime.now(timezone.utc)
                job.status = "failed"
                job.error_message = "File content is empty"
                job.finished_at = datetime.now(timezone.utc)
                await db.commit()
                return

            normalized = _normalize_text(text)
            ocr_required = file.file_type in ("png", "jpg", "jpeg")

            parsed_doc = ParsedDocument(
                file_id=file.id,
                raw_text=text,
                normalized_text=normalized,
                language="ko",
                page_count=1,
                parser_name="builtin",
                parser_version="1.0",
                ocr_applied=ocr_required,
                parse_confidence=1.0 if not ocr_required else 0.7,
            )
            db.add(parsed_doc)
            await db.flush()

            if ocr_required:
                file.status = FileStatus.ocr_pending
                file.ocr_required = True
            else:
                file.status = FileStatus.embedding_pending
            await db.commit()

            chunks = _create_chunks(file.id, parsed_doc.id, normalized)
            db.add_all(chunks)
            await db.flush()

            for chunk in chunks:
                chunk.embedding_status = "completed"

            file.status = FileStatus.ready
            file.is_searchable = True
            file.is_quiz_eligible = True
            file.processing_finished_at = datetime.now(timezone.utc)

            job.status = "completed"
            job.finished_at = datetime.now(timezone.utc)
            await db.commit()

        except Exception as e:
            file.status = FileStatus.failed_terminal
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

        async with httpx.AsyncClient() as client:
            resp = await client.get(
                ip_url,
                headers={"Host": hostname},
                follow_redirects=False,
                timeout=30,
            )
            if resp.status_code != 200:
                return ""
            from bs4 import BeautifulSoup

            soup = BeautifulSoup(resp.text, "html.parser")
            for tag in soup(["script", "style", "nav", "footer"]):
                tag.decompose()
            return soup.get_text(separator="\n")
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
                    or cfg.openai_generation_model,
                    fallback_model=cfg.openai_fallback_generation_model,
                    system_message=SYSTEM_PROMPT_RETRY_GENERATION,
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

            recent_concepts_result = await db.execute(
                select(QuizItem.concept_key)
                .join(QuizSession, QuizSession.id == QuizItem.quiz_session_id)
                .where(QuizSession.user_id == session.user_id)
                .order_by(QuizItem.created_at.desc())
                .limit(20)
            )
            recent_concepts = [r[0] for r in recent_concepts_result.all() if r[0]]
            concept_counts = {}
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
                or cfg.openai_generation_model,
                fallback_model=cfg.openai_fallback_generation_model,
                system_message=SYSTEM_PROMPT_QUIZ_GENERATION,
            )

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

            total_score = 0.0
            max_score = 0.0

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
                normalized = normalize_answer(user_answer) if user_answer else ""
                if not user_answer:
                    judgement = Judgement.skipped
                    score_awarded = 0.0
                    error_type = ErrorType.no_response
                else:
                    from app.utils.ai_client import (
                        call_ai_with_fallback,
                        GRADING_SCHEMA,
                    )
                    from app.config import settings as cfg

                    if item.question_type in (
                        QuestionType.multiple_choice,
                        QuestionType.ox,
                    ):
                        correct = item.correct_answer_json or {}
                        correct_val = normalize_answer(str(correct.get("answer", "")))
                        if normalized == correct_val:
                            judgement = Judgement.correct
                            score_awarded = 1.0
                            error_type = None
                        else:
                            judgement = Judgement.incorrect
                            score_awarded = 0.0
                            error_type = ErrorType.careless_mistake
                    else:
                        try:
                            import json as json_mod

                            prompt = f"""채점할 답안:
문제: {item.question_text}
정답: {json_mod.dumps(item.correct_answer_json or {}, ensure_ascii=False)}
사용자 답: {user_answer}
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
                            error_type = (
                                ErrorType(ai_result["error_type"])
                                if ai_result.get("error_type")
                                else None
                            )
                        except Exception:
                            judgement = Judgement.incorrect
                            score_awarded = 0.0
                            error_type = ErrorType.reasoning_error

                existing = await db.execute(
                    select(AnswerLog).where(
                        AnswerLog.quiz_item_id == item.id,
                        AnswerLog.user_id == session.user_id,
                        AnswerLog.is_active_result == True,
                    )
                )
                for old_log in existing.scalars().all():
                    old_log.is_active_result = False

                answer_log = AnswerLog(
                    quiz_item_id=item.id,
                    quiz_session_id=session.id,
                    user_id=session.user_id,
                    user_answer_raw=user_answer,
                    user_answer_normalized=normalized if user_answer else "",
                    judgement=judgement,
                    score_awarded=score_awarded,
                    max_score=1.0,
                    grading_confidence=1.0,
                    error_type=error_type,
                    is_active_result=True,
                    graded_at=datetime.now(timezone.utc),
                )
                db.add(answer_log)

                total_score += score_awarded
                max_score += 1.0

                await _update_weak_point(db, session.user_id, item, judgement)

            session.total_score = total_score
            session.max_score = max_score
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


async def review_objection(job_id: str):
    async with async_session() as db:
        job_result = await db.execute(select(Job).where(Job.id == job_id))
        job = job_result.scalar_one_or_none()
        if not job:
            return

        objection_result = await db.execute(
            select(Objection).where(Objection.id == job.target_id)
        )
        objection = objection_result.scalar_one_or_none()
        if not objection:
            job.status = "failed"
            await db.commit()
            return

        job.status = "processing"
        await db.commit()

        try:
            answer_result = await db.execute(
                select(AnswerLog).where(AnswerLog.id == objection.answer_log_id)
            )
            answer_log = answer_result.scalar_one_or_none()
            item_result = await db.execute(
                select(QuizItem).where(QuizItem.id == objection.quiz_item_id)
            )
            quiz_item = item_result.scalar_one_or_none()

            if not answer_log or not quiz_item:
                objection.status = ObjectionStatus.rejected
                job.status = "completed"
                await db.commit()
                return

            from app.utils.ai_client import (
                call_ai_with_fallback,
                OBJECTION_REVIEW_SCHEMA,
            )
            from app.config import settings as cfg
            import json as json_mod

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
                primary_model=cfg.openai_grading_model,
                fallback_model=cfg.openai_fallback_grading_model,
                system_message=SYSTEM_PROMPT_OBJECTION_REVIEW,
            )

            objection.review_result_json = ai_result
            objection.decided_at = datetime.now(timezone.utc)
            objection.decided_by = "ai"

            decision = ai_result.get("decision", "rejected")
            if ai_result.get("should_apply") and decision in (
                "upheld",
                "partially_upheld",
            ):
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

                # Recalculate session totals after applying the objection
                session_result = await db.execute(
                    select(QuizSession).where(
                        QuizSession.id == objection.quiz_session_id
                    )
                )
                session = session_result.scalar_one_or_none()
                if session:
                    score_agg = await db.execute(
                        select(
                            func.sum(AnswerLog.score_awarded),
                            func.sum(AnswerLog.max_score),
                        ).where(
                            AnswerLog.quiz_session_id == objection.quiz_session_id,
                            AnswerLog.user_id == objection.user_id,
                            AnswerLog.is_active_result == True,
                        )
                    )
                    agg_row = score_agg.one()
                    session.total_score = float(agg_row[0] or 0.0)
                    session.max_score = float(agg_row[1] or 0.0)

                objection.status = ObjectionStatus.applied
                if session:
                    session.status = QuizSessionStatus.regraded
            else:
                objection.status = (
                    ObjectionStatus.rejected
                    if decision == "rejected"
                    else ObjectionStatus(decision)
                )

                session_result = await db.execute(
                    select(QuizSession).where(
                        QuizSession.id == objection.quiz_session_id
                    )
                )
                session = session_result.scalar_one_or_none()
                if session and session.status == QuizSessionStatus.objection_pending:
                    remaining_result = await db.execute(
                        select(Objection).where(
                            Objection.quiz_session_id == objection.quiz_session_id,
                            Objection.id != objection.id,
                            Objection.status.in_(
                                [
                                    ObjectionStatus.submitted,
                                    ObjectionStatus.under_review,
                                ]
                            ),
                        )
                    )
                    if not remaining_result.scalar_one_or_none():
                        session.status = QuizSessionStatus.graded

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
