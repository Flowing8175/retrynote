import json
import logging
import re
from datetime import datetime, timezone

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.file import File, ParsedDocument
from app.models.study import (
    ContentStatus,
    StudyFlashcard,
    StudyFlashcardSet,
    StudyMindmap,
    StudySummary,
)
from app.prompts.study import (
    FLASHCARD_PROMPT,
    MINDMAP_PROMPT,
    STUDY_MODEL,
    SUMMARY_PROMPT,
)
from app.services.usage_service import UsageService
from app.tier_config import calculate_credit_cost
from app.utils.ai_client import get_gemini_client

logger = logging.getLogger(__name__)

_MAX_TEXT_CHARS = 100_000
_MIN_TEXT_CHARS = 100


def _strip_json_fences(text: str) -> str:
    text = text.strip()
    match = re.match(r"^```(?:json)?\s*\n?(.*?)\n?```\s*$", text, re.DOTALL)
    if match:
        return match.group(1).strip()
    return text


async def _collect_ai_response(prompt: str) -> tuple[str, int]:
    from google.genai import types as genai_types

    gemini = get_gemini_client()
    config = genai_types.GenerateContentConfig(
        temperature=0.3,
        max_output_tokens=8192,
    )
    stream = await gemini.aio.models.generate_content_stream(
        model=STUDY_MODEL,
        contents=prompt,
        config=config,
    )

    chunks: list[str] = []
    total_tokens = 0
    async for chunk in stream:
        if chunk.text:
            chunks.append(chunk.text)
        usage = getattr(chunk, "usage_metadata", None)
        if usage:
            total_tokens = getattr(usage, "total_token_count", 0) or 0

    return "".join(chunks).strip(), total_tokens


async def _reconcile_credit(
    db: AsyncSession,
    user_id: str,
    credit_estimate: float,
    total_tokens: int,
) -> None:
    if not user_id:
        return
    actual_cost = calculate_credit_cost(total_tokens, STUDY_MODEL)
    delta = actual_cost - credit_estimate
    if abs(delta) > 0.001:
        await UsageService().adjust_credit(db, user_id, "quiz", delta)


def _compute_tree_layout(nodes: list[dict], edges: list[dict]) -> list[dict]:
    node_ids = {n["id"] for n in nodes}
    children: dict[str, list[str]] = {nid: [] for nid in node_ids}
    has_parent: set[str] = set()

    for edge in edges:
        src = str(edge.get("source", ""))
        tgt = str(edge.get("target", ""))
        if src in children and tgt in node_ids:
            children[src].append(tgt)
            has_parent.add(tgt)

    roots = [nid for nid in node_ids if nid not in has_parent]
    if not roots:
        roots = [nodes[0]["id"]] if nodes else []

    level_nodes: dict[int, list[str]] = {}
    visited: set[str] = set()
    queue: list[tuple[str, int]] = [(r, 0) for r in roots]

    while queue:
        nid, level = queue.pop(0)
        if nid in visited:
            continue
        visited.add(nid)
        level_nodes.setdefault(level, []).append(nid)
        for child in children.get(nid, []):
            if child not in visited:
                queue.append((child, level + 1))

    H_SPACING = 200
    V_SPACING = 150
    pos: dict[str, dict] = {}

    for level, nids in level_nodes.items():
        total_width = (len(nids) - 1) * H_SPACING
        start_x = 400 - total_width / 2
        for i, nid in enumerate(nids):
            pos[nid] = {"x": start_x + i * H_SPACING, "y": level * V_SPACING + 50}

    for node in nodes:
        nid = node.get("id")
        if nid in pos:
            node["position"] = pos[nid]

    return nodes


async def _get_or_create_summary(db: AsyncSession, file_id: str) -> StudySummary:
    result = await db.execute(
        select(StudySummary).where(StudySummary.file_id == file_id)
    )
    summary = result.scalar_one_or_none()
    if summary is not None:
        return summary

    summary = StudySummary(file_id=file_id, status=ContentStatus.not_generated)
    db.add(summary)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        result = await db.execute(
            select(StudySummary).where(StudySummary.file_id == file_id)
        )
        summary = result.scalar_one()
    return summary


async def generate_summary(
    file_id: str,
    db: AsyncSession,
    *,
    user_id: str = "",
    credit_estimate: float = 0,
) -> None:
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
        markdown_content, total_tokens = await _collect_ai_response(prompt)

        summary.content = markdown_content
        summary.status = ContentStatus.completed
        summary.generated_at = datetime.now(timezone.utc)
        summary.model_used = STUDY_MODEL
        await _reconcile_credit(db, user_id, credit_estimate, total_tokens)
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


async def generate_flashcards(
    file_id: str,
    db: AsyncSession,
    force_regenerate: bool = False,
    *,
    user_id: str = "",
    credit_estimate: float = 0,
) -> None:
    result = await db.execute(
        select(StudyFlashcardSet).where(
            StudyFlashcardSet.file_id == file_id,
            StudyFlashcardSet.deleted_at.is_(None),
        )
    )
    existing = result.scalar_one_or_none()

    if existing is not None and existing.status == ContentStatus.generating:
        flashcard_set = existing
    elif existing is not None and not force_regenerate:
        logger.info("generate_flashcards: set already exists for file %s", file_id)
        return
    else:
        if existing is not None and force_regenerate:
            existing.deleted_at = datetime.now(timezone.utc)
            await db.flush()

        flashcard_set = StudyFlashcardSet(
            file_id=file_id,
            status=ContentStatus.generating,
        )
        db.add(flashcard_set)
        await db.flush()
        await db.commit()

    try:
        file_result = await db.execute(select(File).where(File.id == file_id))
        file = file_result.scalar_one_or_none()

        if file is None:
            logger.error("generate_flashcards: file %s not found", file_id)
            flashcard_set.status = ContentStatus.failed
            await db.commit()
            return

        parsed_doc: ParsedDocument | None = file.parsed_document
        text = (parsed_doc.normalized_text or "") if parsed_doc else ""

        if len(text) < _MIN_TEXT_CHARS:
            logger.warning(
                "generate_flashcards: file %s text too short (%d chars)",
                file_id,
                len(text),
            )
            flashcard_set.status = ContentStatus.failed
            await db.commit()
            return

        if len(text) > _MAX_TEXT_CHARS:
            text = text[:_MAX_TEXT_CHARS]

        prompt = FLASHCARD_PROMPT.format(document_text=text)
        raw_text, total_tokens = await _collect_ai_response(prompt)
        raw = _strip_json_fences(raw_text)

        try:
            cards_data = json.loads(raw)
        except json.JSONDecodeError:
            logger.warning(
                "generate_flashcards: JSON parse failed on first attempt for file %s, retrying",
                file_id,
            )
            retry_prompt = (
                prompt + "\n\n[중요] 반드시 순수 JSON 배열만 출력하세요."
                " 코드 펜스, 마크다운, 설명 없이 JSON 배열만 반환하세요."
            )
            raw_text2, retry_tokens = await _collect_ai_response(retry_prompt)
            total_tokens += retry_tokens
            raw2 = _strip_json_fences(raw_text2)
            try:
                cards_data = json.loads(raw2)
            except json.JSONDecodeError as exc:
                logger.error(
                    "generate_flashcards: JSON parse failed on retry for file %s: %s",
                    file_id,
                    exc,
                )
                flashcard_set.status = ContentStatus.failed
                await _reconcile_credit(db, user_id, credit_estimate, total_tokens)
                await db.commit()
                return

        if not isinstance(cards_data, list):
            logger.error(
                "generate_flashcards: unexpected JSON structure (not a list) for file %s",
                file_id,
            )
            flashcard_set.status = ContentStatus.failed
            await db.commit()
            return

        flashcards = [
            StudyFlashcard(
                flashcard_set_id=flashcard_set.id,
                front=str(card.get("front", "")),
                back=str(card.get("back", "")),
                order=idx,
            )
            for idx, card in enumerate(cards_data)
            if isinstance(card, dict) and card.get("front") and card.get("back")
        ]

        if not flashcards:
            logger.error(
                "generate_flashcards: no valid cards parsed for file %s", file_id
            )
            flashcard_set.status = ContentStatus.failed
            await db.commit()
            return

        await db.execute(
            delete(StudyFlashcard).where(
                StudyFlashcard.flashcard_set_id == flashcard_set.id
            )
        )
        db.add_all(flashcards)
        flashcard_set.status = ContentStatus.completed
        flashcard_set.generated_at = datetime.now(timezone.utc)
        flashcard_set.model_used = STUDY_MODEL
        await _reconcile_credit(db, user_id, credit_estimate, total_tokens)
        await db.commit()

        logger.info(
            "generate_flashcards: completed for file %s (%d cards)",
            file_id,
            len(flashcards),
        )

    except Exception as exc:
        logger.exception("generate_flashcards: failed for file %s: %s", file_id, exc)
        try:
            flashcard_set.status = ContentStatus.failed
            await db.commit()
        except Exception:
            pass


async def generate_mindmap(
    file_id: str,
    db: AsyncSession,
    force_regenerate: bool = False,
    *,
    user_id: str = "",
    credit_estimate: float = 0,
) -> None:
    result = await db.execute(
        select(StudyMindmap).where(
            StudyMindmap.file_id == file_id,
            StudyMindmap.deleted_at.is_(None),
        )
    )
    existing = result.scalar_one_or_none()

    if existing is not None and existing.status == ContentStatus.generating:
        mindmap = existing
    elif existing is not None and not force_regenerate:
        logger.info("generate_mindmap: mindmap already exists for file %s", file_id)
        return
    else:
        if existing is not None and force_regenerate:
            existing.deleted_at = datetime.now(timezone.utc)
            await db.flush()

        mindmap = StudyMindmap(file_id=file_id, status=ContentStatus.generating)
        db.add(mindmap)
        await db.flush()
        await db.commit()

    try:
        file_result = await db.execute(select(File).where(File.id == file_id))
        file = file_result.scalar_one_or_none()

        if file is None:
            logger.error("generate_mindmap: file %s not found", file_id)
            mindmap.status = ContentStatus.failed
            await db.commit()
            return

        parsed_doc: ParsedDocument | None = file.parsed_document
        text = (parsed_doc.normalized_text or "") if parsed_doc else ""

        if len(text) < _MIN_TEXT_CHARS:
            logger.warning(
                "generate_mindmap: file %s text too short (%d chars)",
                file_id,
                len(text),
            )
            mindmap.status = ContentStatus.failed
            await db.commit()
            return

        if len(text) > _MAX_TEXT_CHARS:
            text = text[:_MAX_TEXT_CHARS]

        prompt = MINDMAP_PROMPT.format(document_text=text)
        raw_text, total_tokens = await _collect_ai_response(prompt)
        raw = _strip_json_fences(raw_text)

        try:
            mindmap_data = json.loads(raw)
        except json.JSONDecodeError:
            logger.warning(
                "generate_mindmap: JSON parse failed on first attempt for file %s, retrying",
                file_id,
            )
            retry_prompt = (
                prompt + "\n\n[중요] 반드시 순수 JSON 객체만 출력하세요."
                ' 코드 펜스, 마크다운, 설명 없이 {"nodes": [...], "edges": [...]} 형식의 JSON만 반환하세요.'
            )
            raw_text2, retry_tokens = await _collect_ai_response(retry_prompt)
            total_tokens += retry_tokens
            raw2 = _strip_json_fences(raw_text2)
            try:
                mindmap_data = json.loads(raw2)
            except json.JSONDecodeError as exc:
                logger.error(
                    "generate_mindmap: JSON parse failed on retry for file %s: %s",
                    file_id,
                    exc,
                )
                mindmap.status = ContentStatus.failed
                await _reconcile_credit(db, user_id, credit_estimate, total_tokens)
                await db.commit()
                return

        nodes = mindmap_data.get("nodes", [])
        edges = mindmap_data.get("edges", [])

        if not isinstance(nodes, list) or not isinstance(edges, list):
            logger.error(
                "generate_mindmap: invalid top-level structure for file %s", file_id
            )
            mindmap.status = ContentStatus.failed
            await db.commit()
            return

        needs_layout = False
        for node in nodes:
            if not isinstance(node, dict):
                continue
            if "data" not in node or not isinstance(node["data"], dict):
                node["data"] = {"label": str(node.get("id", ""))}
            elif "label" not in node["data"]:
                node["data"]["label"] = str(node.get("id", ""))
            pos = node.get("position")
            if (
                not isinstance(pos, dict)
                or not isinstance(pos.get("x"), (int, float))
                or not isinstance(pos.get("y"), (int, float))
            ):
                needs_layout = True

        if needs_layout:
            logger.info(
                "generate_mindmap: computing tree layout for file %s"
                " (missing/invalid positions)",
                file_id,
            )
            nodes = _compute_tree_layout(nodes, edges)

        mindmap.data = {"nodes": nodes, "edges": edges}
        mindmap.status = ContentStatus.completed
        mindmap.generated_at = datetime.now(timezone.utc)
        mindmap.model_used = STUDY_MODEL
        await _reconcile_credit(db, user_id, credit_estimate, total_tokens)
        await db.commit()

        logger.info(
            "generate_mindmap: completed for file %s (%d nodes, %d edges)",
            file_id,
            len(nodes),
            len(edges),
        )

    except Exception as exc:
        logger.exception("generate_mindmap: failed for file %s: %s", file_id, exc)
        try:
            mindmap.status = ContentStatus.failed
            await db.commit()
        except Exception:
            pass
