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
    from app.services.quiz_service import admin_regrade

    _run_async_task(admin_regrade(job_id))


logger = logging.getLogger(__name__)


@celery_app.task(name="cleanup_guest_data")
def cleanup_guest_data_task():
    async def _run():
        from app.database import async_session
        from app.services.guest_session_service import GuestSessionService
        from app.config import settings
        async with async_session() as db:
            count = await GuestSessionService.cleanup_expired(db, ttl_hours=settings.GUEST_SESSION_TTL_HOURS)
            await db.commit()
            logger.info(f"Cleaned up {count} expired guest sessions")

    _run_async_task(_run())


from celery.schedules import crontab

celery_app.conf.beat_schedule = {
    **getattr(celery_app.conf, 'beat_schedule', {}),
    'guest-cleanup': {
        'task': 'cleanup_guest_data',
        'schedule': crontab(minute=0),  # every hour
    },
}
