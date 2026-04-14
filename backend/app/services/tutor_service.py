import logging
from typing import Any, AsyncGenerator, cast

from google.genai import types as genai_types
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.file import ParsedDocument
from app.models.study import MessageRole, StudyChat, StudyMessage
from app.prompts.study import STUDY_MODEL, TUTOR_SYSTEM_PROMPT
from app.services.usage_service import UsageService
from app.tier_config import calculate_credit_cost
from app.utils.ai_client import get_gemini_client
from app.utils.sse import sse_data, sse_done, sse_error

logger = logging.getLogger(__name__)

MAX_HISTORY_MESSAGES = 20
MAX_DOC_CHARS = 100_000


async def get_or_create_chat(file_id: str, db: AsyncSession) -> StudyChat:
    result = await db.execute(
        select(StudyChat)
        .where(StudyChat.file_id == file_id, StudyChat.deleted_at.is_(None))
        .order_by(StudyChat.created_at.desc())
        .limit(1)
    )
    chat = result.scalar_one_or_none()
    if chat is None:
        chat = await create_new_chat(file_id, db)
    return chat


async def create_new_chat(file_id: str, db: AsyncSession) -> StudyChat:
    chat = StudyChat(file_id=file_id)
    db.add(chat)
    await db.flush()
    return chat


async def get_chat_history(file_id: str, db: AsyncSession) -> list[StudyMessage]:
    chat = await get_or_create_chat(file_id, db)
    result = await db.execute(
        select(StudyMessage)
        .where(StudyMessage.chat_id == chat.id)
        .order_by(StudyMessage.created_at.asc())
    )
    return list(result.scalars().all())


async def get_chat_sessions(file_id: str, db: AsyncSession) -> list[StudyChat]:
    result = await db.execute(
        select(StudyChat)
        .where(StudyChat.file_id == file_id, StudyChat.deleted_at.is_(None))
        .order_by(StudyChat.created_at.desc())
    )
    return list(result.scalars().all())


async def stream_tutor_response(
    file_id: str,
    message: str,
    page_context: int | None,
    db: AsyncSession,
    user_id: str = "",
    credit_estimate: float = 0,
) -> AsyncGenerator[str, None]:
    try:
        parsed_result = await db.execute(
            select(ParsedDocument).where(ParsedDocument.file_id == file_id)
        )
        parsed_doc = parsed_result.scalar_one_or_none()
        doc_text = ""
        if parsed_doc and parsed_doc.normalized_text:
            doc_text = parsed_doc.normalized_text[:MAX_DOC_CHARS]

        chat = await get_or_create_chat(file_id, db)

        user_msg = StudyMessage(
            chat_id=chat.id,
            role=MessageRole.user,
            content=message,
            page_context=page_context,
        )
        db.add(user_msg)
        await db.commit()

        history_result = await db.execute(
            select(StudyMessage)
            .where(
                StudyMessage.chat_id == chat.id,
                StudyMessage.id != user_msg.id,
            )
            .order_by(StudyMessage.created_at.asc())
        )
        history = list(history_result.scalars().all())
        if len(history) > MAX_HISTORY_MESSAGES:
            history = history[-MAX_HISTORY_MESSAGES:]

        system_part = TUTOR_SYSTEM_PROMPT.split("학습자 질문:")[0].strip()
        system_instruction = system_part.format(document_text=doc_text)

        contents: list[genai_types.Content] = []
        for msg in history:
            gemini_role = "user" if msg.role == MessageRole.user else "model"
            contents.append(
                genai_types.Content(
                    role=gemini_role,
                    parts=[genai_types.Part(text=msg.content)],
                )
            )
        contents.append(
            genai_types.Content(
                role="user",
                parts=[genai_types.Part(text=message)],
            )
        )

        config = genai_types.GenerateContentConfig(
            system_instruction=system_instruction,
            temperature=0.7,
            max_output_tokens=2048,
        )

        gemini = get_gemini_client()
        full_response = ""
        total_tokens = 0

        stream = await gemini.aio.models.generate_content_stream(
            model=STUDY_MODEL,
            contents=cast(Any, contents),
            config=config,
        )

        async for chunk in stream:
            if chunk.text:
                full_response += chunk.text
                yield sse_data({"token": chunk.text})
            usage = getattr(chunk, "usage_metadata", None)
            if usage:
                total_tokens = getattr(usage, "total_token_count", 0) or 0

        assistant_msg = StudyMessage(
            chat_id=chat.id,
            role=MessageRole.assistant,
            content=full_response,
            page_context=page_context,
        )
        db.add(assistant_msg)

        if user_id and credit_estimate:
            actual_cost = calculate_credit_cost(total_tokens, STUDY_MODEL)
            delta = actual_cost - credit_estimate
            if abs(delta) > 0.001:
                await UsageService().adjust_credit(db, user_id, "quiz", delta)

        await db.commit()

        yield sse_done()

    except Exception as exc:
        logger.exception("stream_tutor_response error for file_id=%s: %s", file_id, exc)
        try:
            await db.rollback()
        except Exception:
            pass
        yield sse_error(str(exc))
