import logging

from app.workers.celery_app import celery_app, _run_async_task

logger = logging.getLogger(__name__)


@celery_app.task(name="generate_study_summary")
def generate_summary_task(file_id: str):
    async def _run():
        from app.database import async_session
        from app.services.study_service import generate_summary

        async with async_session() as db:
            await generate_summary(file_id, db)

    try:
        _run_async_task(_run())
    except Exception as exc:
        logger.exception(
            "generate_study_summary task failed for file %s: %s", file_id, exc
        )
        raise


@celery_app.task(name="generate_study_flashcards")
def generate_flashcards_task(file_id: str):
    pass


@celery_app.task(name="generate_study_mindmap")
def generate_mindmap_task(file_id: str):
    pass
