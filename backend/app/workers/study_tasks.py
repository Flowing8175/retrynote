import logging

from app.workers.celery_app import celery_app, _run_async_task

logger = logging.getLogger(__name__)


@celery_app.task(name="generate_study_summary")
def generate_summary_task(file_id: str, user_id: str = "", credit_estimate: float = 0):
    async def _run():
        from app.database import async_session
        from app.services.study_service import generate_summary

        async with async_session() as db:
            await generate_summary(
                file_id, db, user_id=user_id, credit_estimate=credit_estimate
            )

    try:
        _run_async_task(_run())
    except Exception as exc:
        logger.exception(
            "generate_study_summary task failed for file %s: %s", file_id, exc
        )
        raise


@celery_app.task(name="generate_study_flashcards")
def generate_flashcards_task(
    file_id: str, user_id: str = "", credit_estimate: float = 0
):
    async def _run():
        from app.database import async_session
        from app.services.study_service import generate_flashcards

        async with async_session() as db:
            await generate_flashcards(
                file_id, db, user_id=user_id, credit_estimate=credit_estimate
            )

    try:
        _run_async_task(_run())
    except Exception as exc:
        logger.exception(
            "generate_study_flashcards task failed for file %s: %s", file_id, exc
        )
        raise


@celery_app.task(name="generate_study_mindmap")
def generate_mindmap_task(file_id: str, user_id: str = "", credit_estimate: float = 0):
    async def _run():
        from app.database import async_session
        from app.services.study_service import generate_mindmap

        async with async_session() as db:
            await generate_mindmap(
                file_id, db, user_id=user_id, credit_estimate=credit_estimate
            )

    try:
        _run_async_task(_run())
    except Exception as exc:
        logger.exception(
            "generate_study_mindmap task failed for file %s: %s", file_id, exc
        )
        raise


@celery_app.task(name="generate_study_items")
def generate_study_items_task(
    file_id: str,
    user_id: str = "",
    credit_estimate: float = 0,
    item_type: str = "mcq",
    difficulty: str = "medium",
    count: int = 5,
    language: str = "auto",
    force_regenerate: bool = False,
):
    async def _run():
        from app.database import async_session
        from app.services.study_service import generate_study_items

        async with async_session() as db:
            await generate_study_items(
                file_id,
                db,
                item_type=item_type,
                difficulty=difficulty,
                count=count,
                language=language,
                force_regenerate=force_regenerate,
                user_id=user_id,
                credit_estimate=credit_estimate,
            )

    try:
        _run_async_task(_run())
    except Exception as exc:
        logger.exception(
            "generate_study_items task failed for file=%s type=%s diff=%s: %s",
            file_id,
            item_type,
            difficulty,
            exc,
        )
        raise
