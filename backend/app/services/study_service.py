import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session
from app.models.file import File, ParsedDocument
from app.models.study import StudySummary, ContentStatus
from app.prompts.study import STUDY_MODEL, SUMMARY_PROMPT
from app.utils.ai_client import stream_ai_text

logger = logging.getLogger(__name__)

_MAX_TEXT_CHARS = 100_000
_MIN_TEXT_CHARS = 100


async def _get_or_create_summary(db: AsyncSession, file_id: str) -> StudySummary:
    result = await db.execute(
        select(StudySummary).where(StudySummary.file_id == file_id)
    )
    summary = result.scalar_one_or_none()
    if summary is None:
        summary = StudySummary(file_id=file_id, status=ContentStatus.not_generated)
        db.add(summary)
        await db.flush()
    return summary


async def generate_summary(file_id: str, db: AsyncSession) -> None:
    summary = await _get_or_create_summary(db, file_id)

    summary.status = ContentStatus.generating
    await db.commit()

    try:
        file_result = await db.execute(select(File).where(File.id == file_id))
        file = file_result.scalar_one_or_none()

        if file is None:
            logger.error("generate_summary: file %s not found", file_id)
            summary.status = ContentStatus.failed
            summary.content = "파일을 찾을 수 없습니다"
            await db.commit()
            return

        parsed_doc: ParsedDocument | None = file.parsed_document
        text = (parsed_doc.normalized_text or "") if parsed_doc else ""

        if len(text) < _MIN_TEXT_CHARS:
            logger.warning(
                "generate_summary: file %s text too short (%d chars)",
                file_id,
                len(text),
            )
            summary.status = ContentStatus.failed
            summary.content = "내용이 부족합니다"
            await db.commit()
            return

        if len(text) > _MAX_TEXT_CHARS:
            logger.info(
                "generate_summary: truncating file %s text from %d to %d chars",
                file_id,
                len(text),
                _MAX_TEXT_CHARS,
            )
            text = text[:_MAX_TEXT_CHARS]

        prompt = SUMMARY_PROMPT.format(document_text=text)

        chunks: list[str] = []
        async for chunk in stream_ai_text(
            prompt=prompt,
            system_message="",
            model=STUDY_MODEL,
            temperature=0.3,
            max_tokens=8192,
        ):
            chunks.append(chunk)

        markdown_content = "".join(chunks).strip()

        summary.content = markdown_content
        summary.status = ContentStatus.completed
        summary.generated_at = datetime.now(timezone.utc)
        summary.model_used = STUDY_MODEL
        await db.commit()

        logger.info(
            "generate_summary: completed for file %s (%d chars output)",
            file_id,
            len(markdown_content),
        )

    except Exception as exc:
        logger.exception("generate_summary: failed for file %s: %s", file_id, exc)
        try:
            summary.status = ContentStatus.failed
            summary.content = f"생성 중 오류가 발생했습니다: {str(exc)[:200]}"
            await db.commit()
        except Exception:
            pass
