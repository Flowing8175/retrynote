import asyncio
import logging
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
    import os
    import logging
    from sqlalchemy import select
    from app.database import async_session
    from app.models.search import Job
    from app.models.file import File

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

            if file.stored_path and os.path.exists(file.stored_path):
                os.remove(file.stored_path)

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

            from app.services.quiz_service import grade_exam

            session_result = await db.execute(
                select(QuizSession).where(QuizSession.id == item.quiz_session_id)
            )
            session = session_result.scalar_one_or_none()
            if session:
                job.status = "completed"
                await db.commit()

    _run_async_task(_regrade())
