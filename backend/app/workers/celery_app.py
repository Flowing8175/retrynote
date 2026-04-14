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


def dispatch_task(task_name: str, args: list) -> None:
    celery_app.send_task(task_name, args)


def make_job_task(name: str, coro_factory):
    def _fn(self, job_id: str):
        _run_async_task(coro_factory(job_id))

    _fn.__name__ = f"{name}_fn"
    _fn.__qualname__ = f"{name}_fn"
    return celery_app.task(bind=True, name=name, max_retries=3)(_fn)


def _quiz_service_task(fn_name: str):
    def factory(job_id: str):
        from app.services import quiz_service

        return getattr(quiz_service, fn_name)(job_id)

    return factory


process_file_task = make_job_task("process_file", _quiz_service_task("process_file"))
generate_quiz_task = make_job_task("generate_quiz", _quiz_service_task("generate_quiz"))
grade_exam_task = make_job_task("grade_exam", _quiz_service_task("grade_exam"))
review_objection_task = make_job_task(
    "review_objection", _quiz_service_task("review_objection")
)
admin_regrade_task = make_job_task("admin_regrade", _quiz_service_task("admin_regrade"))


async def _file_cleanup_coro(job_id: str) -> None:
    import logging
    from sqlalchemy import select
    from app.database import async_session
    from app.models.search import Job
    from app.models.file import File
    from app.services import storage as _storage

    _logger = logging.getLogger(__name__)
    async with async_session() as db:
        result = await db.execute(select(Job).where(Job.id == job_id))
        job = result.scalar_one_or_none()
        if not job:
            _logger.error("file_cleanup: job %s not found", job_id)
            return

        file_result = await db.execute(select(File).where(File.id == job.target_id))
        file = file_result.scalar_one_or_none()
        if not file:
            _logger.error("file_cleanup: file %s not found", job.target_id)
            job.status = "failed"
            await db.commit()
            return

        if file.stored_path:
            await _storage.delete_file(file.stored_path)

        job.status = "completed"
        await db.commit()


file_cleanup_task = make_job_task("file_cleanup", _file_cleanup_coro)


logger = logging.getLogger(__name__)


@celery_app.task(name="cleanup_guest_data")
def cleanup_guest_data_task():
    async def _run():
        from app.database import async_session
        from app.services.guest_session_service import GuestSessionService
        from app.config import settings

        async with async_session() as db:
            count = await GuestSessionService.cleanup_expired(
                db, ttl_hours=settings.GUEST_SESSION_TTL_HOURS
            )
            await db.commit()
            logger.info(f"Cleaned up {count} expired guest sessions")

    _run_async_task(_run())


from celery.schedules import crontab
from app.workers import study_tasks as _study_tasks  # noqa: F401

celery_app.conf.beat_schedule = {
    **getattr(celery_app.conf, "beat_schedule", {}),
    "guest-cleanup": {
        "task": "cleanup_guest_data",
        "schedule": crontab(minute=0),  # every hour
    },
}
