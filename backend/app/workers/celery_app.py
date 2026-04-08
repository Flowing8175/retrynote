import asyncio
import logging
from datetime import datetime, timezone
from celery import Celery
from app.config import settings


_worker_event_loop: asyncio.AbstractEventLoop | None = None


def _get_worker_event_loop() -> asyncio.AbstractEventLoop:
    global _worker_event_loop

    if _worker_event_loop is None or _worker_event_loop.is_closed():
        _worker_event_loop = asyncio.new_event_loop()
        asyncio.set_event_loop(_worker_event_loop)

    return _worker_event_loop


def _run_async_task(coroutine):
    loop = _get_worker_event_loop()
    return loop.run_until_complete(coroutine)


celery_app = Celery(
    "retrynote",
    broker=settings.redis_url,
    backend=settings.redis_url,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Seoul",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
)

logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)


def dispatch_task(task_name: str, args: list) -> None:
    celery_app.send_task(task_name, args)


@celery_app.task(bind=True, name="process_file", max_retries=3)
def process_file_task(self, job_id: str):
    from app.services.quiz_service import process_file

    _run_async_task(process_file(job_id))


@celery_app.task(bind=True, name="generate_quiz", max_retries=3)
def generate_quiz_task(self, job_id: str):
    from app.services.quiz_service import generate_quiz

    _run_async_task(generate_quiz(job_id))


@celery_app.task(bind=True, name="grade_exam", max_retries=3)
def grade_exam_task(self, job_id: str):
    from app.services.quiz_service import grade_exam

    _run_async_task(grade_exam(job_id))


@celery_app.task(bind=True, name="review_objection", max_retries=3)
def review_objection_task(self, job_id: str):
    from app.services.quiz_service import review_objection

    _run_async_task(review_objection(job_id))


@celery_app.task(bind=True, name="file_cleanup", max_retries=3)
def file_cleanup_task(self, job_id: str):
    import logging
    from sqlalchemy import select
    from app.database import async_session
    from app.models.search import Job
    from app.models.file import File
    from app.services import storage as _storage

    logger = logging.getLogger(__name__)

    async def _cleanup():
        async with async_session() as db:
            result = await db.execute(select(Job).where(Job.id == job_id))
            job = result.scalar_one_or_none()
            if not job:
                logger.error("file_cleanup: job %s not found", job_id)
                return

            file_result = await db.execute(select(File).where(File.id == job.target_id))
            file = file_result.scalar_one_or_none()
            if not file:
                logger.error("file_cleanup: file %s not found", job.target_id)
                job.status = "failed"
                await db.commit()
                return

            if file.stored_path:
                await _storage.delete_file(file.stored_path)

            job.status = "completed"
            await db.commit()

    _run_async_task(_cleanup())


@celery_app.task(bind=True, name="admin_regrade", max_retries=3)
def admin_regrade_task(self, job_id: str):
    import logging
    from sqlalchemy import select
    from app.database import async_session
    from app.models.search import Job
    from app.models.quiz import QuizItem, AnswerLog, QuizSession, QuizSessionStatus

    logger = logging.getLogger(__name__)

    async def _regrade():
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

            # Find all active answer logs for this item (across all users)
            logs_result = await db.execute(
                select(AnswerLog, QuizSession)
                .join(QuizSession, QuizSession.id == AnswerLog.quiz_session_id)
                .where(
                    AnswerLog.quiz_item_id == item.id,
                    AnswerLog.is_active_result == True,
                )
            )
            rows = logs_result.all()

            from app.utils.normalize import normalize_answer
            from app.utils.ai_client import call_ai_with_fallback, GRADING_SCHEMA
            from app.config import settings as cfg
            from app.prompts import SYSTEM_PROMPT_GRADING_SHORT
            import json as json_mod

            for answer_log, session in rows:
                try:
                    user_answer = answer_log.user_answer_raw or ""
                    normalized = normalize_answer(user_answer) if user_answer else ""

                    if item.question_type.value in ("multiple_choice", "ox"):
                        correct = item.correct_answer_json or {}
                        correct_val = normalize_answer(str(correct.get("answer", "")))
                        if normalized == correct_val:
                            new_judgement = "correct"
                            new_score = 1.0
                        else:
                            new_judgement = "incorrect"
                            new_score = 0.0
                    else:
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
                            primary_model=session.generation_model_name
                            or cfg.balanced_generation_model,
                            fallback_model=cfg.eco_generation_model,
                            system_message=SYSTEM_PROMPT_GRADING_SHORT,
                        )
                        new_judgement = ai_result["judgement"]
                        new_score = ai_result["score_awarded"]

                    answer_log.judgement = new_judgement
                    answer_log.score_awarded = new_score
                    answer_log.graded_at = datetime.now(timezone.utc)
                except Exception as exc:
                    logger.warning(
                        "admin_regrade: failed to regrade log %s: %s",
                        answer_log.id,
                        exc,
                    )

            # Recalculate session totals for all affected sessions
            affected_session_ids = {row[1].id for row in rows}
            for sid in affected_session_ids:
                from sqlalchemy import func

                total_q = await db.execute(
                    select(
                        func.sum(AnswerLog.score_awarded), func.sum(AnswerLog.max_score)
                    ).where(
                        AnswerLog.quiz_session_id == sid,
                        AnswerLog.is_active_result == True,
                    )
                )
                agg = total_q.one()
                sess_upd = await db.execute(
                    select(QuizSession).where(QuizSession.id == sid)
                )
                sess_obj = sess_upd.scalar_one_or_none()
                if sess_obj:
                    sess_obj.total_score = float(agg[0] or 0.0)
                    sess_obj.max_score = float(agg[1] or 0.0)

            job.status = "completed"
            job.finished_at = datetime.now(timezone.utc)
            await db.commit()

    _run_async_task(_regrade())
