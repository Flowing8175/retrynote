import asyncio
import hashlib
import json
import logging
import re
from datetime import datetime, timezone
from typing import AsyncGenerator

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.file import File, ParsedDocument
from app.models.study import (
    ContentStatus,
    StudyConceptNote,
    StudyFlashcard,
    StudyFlashcardSet,
    StudyItem,
    StudyItemSet,
    StudyMindmap,
    StudySummary,
)
from app.prompts.study import (
    CONCEPT_NOTES_PROMPT,
    CONCEPT_NOTES_SCHEMA,
    CONCEPT_NOTES_SYSTEM_MESSAGE,
    FLASHCARD_PROMPT,
    FLASHCARD_SCHEMA,
    FLASHCARD_SYSTEM_MESSAGE,
    MINDMAP_PROMPT,
    MINDMAP_SCHEMA,
    MINDMAP_SYSTEM_MESSAGE,
    NODE_EXPLANATION_PROMPT,
    STUDY_MODEL,
    SUMMARY_PROMPT,
    SUMMARY_SCHEMA,
    SUMMARY_SYSTEM_MESSAGE,
)
from app.prompts.study_items import build_study_prompt
from app.services.usage_service import UsageService
from app.tier_config import calculate_credit_cost
from app.utils.ai_client import get_gemini_client, stream_ai_structured_with_thinking
from app.utils.sse import sse_data, sse_done, sse_error
from app.config import settings

logger = logging.getLogger(__name__)

_MAX_TEXT_CHARS = 100_000
_MIN_TEXT_CHARS = 100

_NODE_EXPLAIN_EXCERPT_WINDOW_CHARS = 800
_NODE_EXPLAIN_FALLBACK_EXCERPT_CHARS = 1600
_NODE_EXPLAIN_MAX_OUTPUT_TOKENS = 512
_NODE_EXPLAIN_CACHE_TTL_SECONDS = 60 * 60 * 24 * 30
_NODE_EXPLAIN_CACHE_PREFIX = "mindmap_node_explain"

_FLASHCARD_COUNT = 15
_STUDY_ITEMS_MAX_OUTPUT_TOKENS = 8192

_VALID_ITEM_TYPES = {"mcq", "ox", "cloze", "short_answer", "flashcard"}
_VALID_DIFFICULTIES = {"easy", "medium", "hard", "mixed"}

_ITEMS_ENVELOPE_REINFORCEMENT = (
    '\n\n[중요] 반드시 순수 JSON 객체만 출력하세요.'
    ' 코드 펜스·마크다운·설명 없이 {"items":[...], "error":null, "message":null}'
    ' 형식의 JSON 객체만 반환하세요.'
)


def _strip_json_fences(text: str) -> str:
    text = text.strip()
    match = re.match(r"^```(?:json)?\s*\n?(.*?)\n?```\s*$", text, re.DOTALL)
    if match:
        return match.group(1).strip()
    return text


def _parse_items_envelope(raw_text: str) -> dict | None:
    """Parse the `{"items":[...], "error":..., "message":...}` envelope.

    Returns None on malformed JSON or non-dict top-level; caller retries.
    """
    try:
        data = json.loads(_strip_json_fences(raw_text))
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict):
        return None
    return data


async def _collect_ai_response(
    prompt: str,
    *,
    max_output_tokens: int = 8192,
) -> tuple[str, int]:
    chunks: list[str] = []
    total_tokens = 0

    if STUDY_MODEL.startswith("gemini-"):
        from google.genai import types as genai_types

        gemini = get_gemini_client()
        config = genai_types.GenerateContentConfig(
            temperature=0.3,
            max_output_tokens=max_output_tokens,
        )
        stream = await gemini.aio.models.generate_content_stream(
            model=STUDY_MODEL,
            contents=prompt,
            config=config,
        )
        async for chunk in stream:
            if chunk.text:
                chunks.append(chunk.text)
            usage = getattr(chunk, "usage_metadata", None)
            if usage:
                total_tokens = getattr(usage, "total_token_count", 0) or 0
    else:
        from typing import Any
        from app.utils.ai_client import client as openai_client

        token_limit_key = (
            "max_completion_tokens" if STUDY_MODEL.startswith("gpt-5") else "max_tokens"
        )
        openai_kwargs: dict[str, Any] = {
            "model": STUDY_MODEL,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.3,
            token_limit_key: max_output_tokens,
            "stream": True,
            "stream_options": {"include_usage": True},
        }
        stream = await openai_client.chat.completions.create(**openai_kwargs)  # type: ignore[call-overload]
        async for chunk in stream:
            delta = chunk.choices[0].delta if chunk.choices else None
            if delta and delta.content:
                chunks.append(delta.content)
            if chunk.usage:
                total_tokens = chunk.usage.total_tokens or 0

    return "".join(chunks).strip(), total_tokens


async def _reconcile_credit(
    db: AsyncSession,
    user_id: str,
    credit_estimate: float,
    total_tokens: int,
    source: str = "tier",
    batch_ids: list[str] | None = None,
) -> None:
    if not user_id:
        return
    actual_cost = calculate_credit_cost(total_tokens, STUDY_MODEL)
    delta = actual_cost - credit_estimate
    if abs(delta) > 0.001:
        if source == "ai_credit" and batch_ids:
            await UsageService().adjust_credit_ai(db, batch_ids, -delta)
        else:
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
        select(StudySummary).where(
            StudySummary.file_id == file_id,
            StudySummary.deleted_at.is_(None),
        )
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
            select(StudySummary).where(
                StudySummary.file_id == file_id,
                StudySummary.deleted_at.is_(None),
            )
        )
        summary = result.scalar_one()
    return summary


async def _get_or_create_concept_note(db: AsyncSession, file_id: str) -> StudyConceptNote:
    result = await db.execute(
        select(StudyConceptNote).where(
            StudyConceptNote.file_id == file_id,
            StudyConceptNote.deleted_at.is_(None),
        )
    )
    concept_note = result.scalar_one_or_none()
    if concept_note is not None:
        return concept_note

    concept_note = StudyConceptNote(file_id=file_id, status=ContentStatus.not_generated)
    db.add(concept_note)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        result = await db.execute(
            select(StudyConceptNote).where(
                StudyConceptNote.file_id == file_id,
                StudyConceptNote.deleted_at.is_(None),
            )
        )
        concept_note = result.scalar_one()
    return concept_note


async def generate_summary(
    file_id: str,
    db: AsyncSession,
    *,
    user_id: str = "",
    credit_estimate: float = 0,
    credit_source: str = "tier",
    credit_batch_ids: list[str] | None = None,
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

        ai_result: dict | None = None
        total_tokens = 0

        async with asyncio.timeout(settings.generation_timeout):
            async for event in stream_ai_structured_with_thinking(
                prompt=prompt,
                schema=SUMMARY_SCHEMA,
                system_message=SUMMARY_SYSTEM_MESSAGE,
                primary_model=STUDY_MODEL,
                fallback_model=settings.eco_generation_model,
                max_tokens=8192,
                reasoning_effort="low",
                thinking_level="MEDIUM",
            ):
                if event.get("type") == "result":
                    data = event.get("data")
                    if isinstance(data, dict):
                        ai_result = data
                    tokens_raw = event.get("tokens_used") or 0
                    total_tokens = int(tokens_raw) if isinstance(tokens_raw, (int, float)) else 0

        if ai_result is None:
            raise ValueError("AI stream ended without a result")

        summary.content = ai_result.get("content", "")
        summary.status = ContentStatus.completed
        summary.generated_at = datetime.now(timezone.utc)
        summary.model_used = STUDY_MODEL
        await _reconcile_credit(db, user_id, credit_estimate, total_tokens, credit_source, credit_batch_ids)
        await db.commit()

        logger.info(
            "generate_summary: completed for file %s (%d chars output)",
            file_id,
            len(summary.content or ""),
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
    credit_source: str = "tier",
    credit_batch_ids: list[str] | None = None,
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

        prompt = build_study_prompt(
            document_text=text,
            item_type="flashcard",
            difficulty="mixed",
            count=_FLASHCARD_COUNT,
            language="auto",
        )
        raw_text, total_tokens = await _collect_ai_response(prompt)
        envelope = _parse_items_envelope(raw_text)

        if envelope is None:
            logger.warning(
                "generate_flashcards: JSON parse failed on first attempt for file %s, retrying",
                file_id,
            )
            retry_prompt = prompt + _ITEMS_ENVELOPE_REINFORCEMENT
            raw_text2, retry_tokens = await _collect_ai_response(retry_prompt)
            total_tokens += retry_tokens
            envelope = _parse_items_envelope(raw_text2)
            if envelope is None:
                logger.error(
                    "generate_flashcards: JSON parse failed on retry for file %s",
                    file_id,
                )
                flashcard_set.status = ContentStatus.failed
                await _reconcile_credit(db, user_id, credit_estimate, total_tokens, credit_source, credit_batch_ids)
                await db.commit()
                return

        cards_data = envelope.get("items", [])
        if not isinstance(cards_data, list):
            logger.error(
                "generate_flashcards: items field is not a list for file %s",
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
        await _reconcile_credit(db, user_id, credit_estimate, total_tokens, credit_source, credit_batch_ids)
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
    credit_source: str = "tier",
    credit_batch_ids: list[str] | None = None,
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
                await _reconcile_credit(db, user_id, credit_estimate, total_tokens, credit_source, credit_batch_ids)
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
        await _reconcile_credit(db, user_id, credit_estimate, total_tokens, credit_source, credit_batch_ids)
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


class MindmapNotReadyError(Exception):
    pass


class NodeNotFoundError(Exception):
    pass


def _node_explanation_cache_key(file_id: str, node_id: str, label: str) -> str:
    label_hash = hashlib.sha256(label.strip().encode("utf-8")).hexdigest()[:16]
    return f"{_NODE_EXPLAIN_CACHE_PREFIX}:{file_id}:{node_id}:{label_hash}"


def _extract_excerpt_around(text: str, keyword: str) -> str:
    if not text:
        return ""
    keyword_stripped = keyword.strip()
    if not keyword_stripped:
        return text[: _NODE_EXPLAIN_FALLBACK_EXCERPT_CHARS]

    idx = text.lower().find(keyword_stripped.lower())
    if idx < 0:
        return text[: _NODE_EXPLAIN_FALLBACK_EXCERPT_CHARS]

    start = max(0, idx - _NODE_EXPLAIN_EXCERPT_WINDOW_CHARS)
    end = min(len(text), idx + len(keyword_stripped) + _NODE_EXPLAIN_EXCERPT_WINDOW_CHARS)
    excerpt = text[start:end]
    if start > 0:
        excerpt = "..." + excerpt
    if end < len(text):
        excerpt = excerpt + "..."
    return excerpt


def _find_node_and_context(
    mindmap_data: dict, node_id: str
) -> tuple[str, str, str]:
    nodes = mindmap_data.get("nodes", [])
    edges = mindmap_data.get("edges", [])
    if not isinstance(nodes, list) or not isinstance(edges, list):
        raise NodeNotFoundError(f"Mindmap data malformed for lookup: {node_id}")

    node_by_id: dict[str, dict] = {}
    for n in nodes:
        if isinstance(n, dict) and "id" in n:
            node_by_id[str(n["id"])] = n

    target = node_by_id.get(str(node_id))
    if target is None:
        raise NodeNotFoundError(f"Node {node_id} not found in mindmap")

    label = str(target.get("data", {}).get("label", "")).strip()
    if not label:
        raise NodeNotFoundError(f"Node {node_id} has no label")

    parents: list[str] = []
    children: list[str] = []
    for edge in edges:
        if not isinstance(edge, dict):
            continue
        src = str(edge.get("source", ""))
        tgt = str(edge.get("target", ""))
        if tgt == str(node_id) and src in node_by_id:
            parent_label = str(node_by_id[src].get("data", {}).get("label", "")).strip()
            if parent_label:
                parents.append(parent_label)
        elif src == str(node_id) and tgt in node_by_id:
            child_label = str(node_by_id[tgt].get("data", {}).get("label", "")).strip()
            if child_label:
                children.append(child_label)

    parent_ctx = ", ".join(parents) if parents else "(없음 - 최상위 개념)"
    children_ctx = ", ".join(children[:8]) if children else "(없음)"
    return label, parent_ctx, children_ctx


async def generate_node_explanation(
    file_id: str,
    node_id: str,
    db: AsyncSession,
    redis_client,
    *,
    user_id: str = "",
    credit_estimate: float = 0,
    credit_source: str = "tier",
    credit_batch_ids: list[str] | None = None,
) -> tuple[str, str, bool]:
    mindmap_result = await db.execute(
        select(StudyMindmap).where(
            StudyMindmap.file_id == file_id,
            StudyMindmap.deleted_at.is_(None),
        )
    )
    mindmap = mindmap_result.scalar_one_or_none()
    if (
        mindmap is None
        or mindmap.status != ContentStatus.completed
        or not isinstance(mindmap.data, dict)
    ):
        status = mindmap.status.value if mindmap else ContentStatus.not_generated.value
        raise MindmapNotReadyError(status)

    label, parent_ctx, children_ctx = _find_node_and_context(mindmap.data, node_id)

    cache_key = _node_explanation_cache_key(file_id, node_id, label)

    if redis_client is not None:
        try:
            cached = await redis_client.get(cache_key)
            if cached is not None:
                text = cached.decode("utf-8") if isinstance(cached, bytes) else cached
                if text:
                    await _reconcile_credit(db, user_id, credit_estimate, 0, credit_source, credit_batch_ids)
                    await db.commit()
                    return label, text, True
        except Exception as exc:
            logger.warning(
                "node_explanation: redis read failed for %s: %s", cache_key, exc
            )

    file_result = await db.execute(select(File).where(File.id == file_id))
    file = file_result.scalar_one_or_none()
    parsed_doc: ParsedDocument | None = file.parsed_document if file else None
    source_text = (parsed_doc.normalized_text or "") if parsed_doc else ""
    if len(source_text) > _MAX_TEXT_CHARS:
        source_text = source_text[:_MAX_TEXT_CHARS]

    excerpt = _extract_excerpt_around(source_text, label)
    if not excerpt:
        excerpt = "(원문 정보 없음 - 마인드맵 구조 맥락만으로 설명)"

    prompt = NODE_EXPLANATION_PROMPT.format(
        keyword=label,
        parent_context=parent_ctx,
        children_context=children_ctx,
        document_excerpt=excerpt,
    )

    raw_text, total_tokens = await _collect_ai_response(
        prompt, max_output_tokens=_NODE_EXPLAIN_MAX_OUTPUT_TOKENS
    )
    explanation = _strip_json_fences(raw_text).strip()
    if not explanation:
        raise ValueError("Empty explanation from model")

    await _reconcile_credit(db, user_id, credit_estimate, total_tokens, credit_source, credit_batch_ids)
    await db.commit()

    if redis_client is not None:
        try:
            await redis_client.setex(
                cache_key,
                _NODE_EXPLAIN_CACHE_TTL_SECONDS,
                explanation.encode("utf-8"),
            )
        except Exception as exc:
            logger.warning(
                "node_explanation: redis write failed for %s: %s", cache_key, exc
            )

    logger.info(
        "node_explanation: generated for file=%s node=%s (%d chars, %d tokens)",
        file_id,
        node_id,
        len(explanation),
        total_tokens,
    )
    return label, explanation, False


def _coerce_list_of_str(value) -> list[str] | None:
    if not isinstance(value, list):
        return None
    out = [str(v) for v in value if v is not None]
    return out or None


def _coerce_options(value) -> list[dict] | None:
    if not isinstance(value, list):
        return None
    out: list[dict] = []
    for opt in value:
        if not isinstance(opt, dict):
            continue
        out.append(
            {
                "label": str(opt.get("label", "")),
                "text": str(opt.get("text", "")),
                "correct": bool(opt.get("correct", False)),
                "misconception_targeted": (
                    str(opt["misconception_targeted"])
                    if opt.get("misconception_targeted") is not None
                    else None
                ),
            }
        )
    return out or None


def _build_study_item(
    raw_item: dict,
    *,
    item_set_id: str,
    order: int,
    default_item_type: str,
) -> StudyItem | None:
    if not isinstance(raw_item, dict):
        return None
    front = raw_item.get("front")
    if not isinstance(front, str) or not front.strip():
        return None
    item_type = str(raw_item.get("item_type") or default_item_type)
    back_raw = raw_item.get("back")
    back = str(back_raw) if isinstance(back_raw, str) and back_raw.strip() else None

    correct_raw = raw_item.get("correct_answer")
    correct_answer = (
        str(correct_raw) if correct_raw is not None and str(correct_raw).strip() else None
    )

    return StudyItem(
        item_set_id=item_set_id,
        order=order,
        item_type=item_type,
        front=front,
        back=back,
        options=_coerce_options(raw_item.get("options")),
        correct_answer=correct_answer,
        acceptable_answers=_coerce_list_of_str(raw_item.get("acceptable_answers")),
        key_points=_coerce_list_of_str(raw_item.get("key_points")),
        bloom_level=(
            str(raw_item["bloom_level"])
            if isinstance(raw_item.get("bloom_level"), str)
            else None
        ),
        difficulty=(
            str(raw_item["difficulty"])
            if isinstance(raw_item.get("difficulty"), str)
            else None
        ),
        source_span=(
            str(raw_item["source_span"])
            if isinstance(raw_item.get("source_span"), str)
            else None
        ),
        explanation=(
            str(raw_item["explanation"])
            if isinstance(raw_item.get("explanation"), str)
            else None
        ),
    )


async def generate_study_items(
    file_id: str,
    db: AsyncSession,
    *,
    item_type: str,
    difficulty: str = "medium",
    count: int = 5,
    language: str = "auto",
    force_regenerate: bool = False,
    user_id: str = "",
    credit_estimate: float = 0,
    credit_source: str = "tier",
    credit_batch_ids: list[str] | None = None,
) -> None:
    if item_type not in _VALID_ITEM_TYPES:
        raise ValueError(f"invalid item_type: {item_type}")
    if difficulty not in _VALID_DIFFICULTIES:
        raise ValueError(f"invalid difficulty: {difficulty}")

    result = await db.execute(
        select(StudyItemSet).where(
            StudyItemSet.file_id == file_id,
            StudyItemSet.item_type == item_type,
            StudyItemSet.difficulty == difficulty,
            StudyItemSet.deleted_at.is_(None),
        )
    )
    existing = result.scalar_one_or_none()

    if existing is not None and existing.status == ContentStatus.generating:
        item_set = existing
    elif existing is not None and not force_regenerate:
        logger.info(
            "generate_study_items: set already exists for file=%s type=%s diff=%s",
            file_id,
            item_type,
            difficulty,
        )
        return
    else:
        if existing is not None and force_regenerate:
            existing.deleted_at = datetime.now(timezone.utc)
            await db.flush()

        item_set = StudyItemSet(
            file_id=file_id,
            item_type=item_type,
            difficulty=difficulty,
            count_requested=count,
            language=language,
            status=ContentStatus.generating,
        )
        db.add(item_set)
        await db.flush()
        await db.commit()

    try:
        file_result = await db.execute(select(File).where(File.id == file_id))
        file = file_result.scalar_one_or_none()

        if file is None:
            logger.error("generate_study_items: file %s not found", file_id)
            item_set.status = ContentStatus.failed
            await db.commit()
            return

        parsed_doc: ParsedDocument | None = file.parsed_document
        text = (parsed_doc.normalized_text or "") if parsed_doc else ""

        if len(text) < _MIN_TEXT_CHARS:
            logger.warning(
                "generate_study_items: file %s text too short (%d chars)",
                file_id,
                len(text),
            )
            item_set.status = ContentStatus.failed
            item_set.error_code = "insufficient_source"
            item_set.error_message = "원문이 최소 100자에 미달합니다"
            await db.commit()
            return

        if len(text) > _MAX_TEXT_CHARS:
            text = text[:_MAX_TEXT_CHARS]

        prompt = build_study_prompt(
            document_text=text,
            item_type=item_type,
            difficulty=difficulty,
            count=count,
            language=language,
        )

        raw_text, total_tokens = await _collect_ai_response(
            prompt, max_output_tokens=_STUDY_ITEMS_MAX_OUTPUT_TOKENS
        )
        envelope = _parse_items_envelope(raw_text)

        if envelope is None:
            logger.warning(
                "generate_study_items: JSON parse failed on first attempt"
                " for file=%s type=%s diff=%s, retrying",
                file_id,
                item_type,
                difficulty,
            )
            retry_prompt = prompt + _ITEMS_ENVELOPE_REINFORCEMENT
            raw_text2, retry_tokens = await _collect_ai_response(
                retry_prompt, max_output_tokens=_STUDY_ITEMS_MAX_OUTPUT_TOKENS
            )
            total_tokens += retry_tokens
            envelope = _parse_items_envelope(raw_text2)
            if envelope is None:
                logger.error(
                    "generate_study_items: JSON parse failed on retry for file=%s",
                    file_id,
                )
                item_set.status = ContentStatus.failed
                await _reconcile_credit(db, user_id, credit_estimate, total_tokens, credit_source, credit_batch_ids)
                await db.commit()
                return

        raw_items = envelope.get("items", [])
        error_code = envelope.get("error")
        error_message = envelope.get("message")
        if not isinstance(raw_items, list):
            logger.error(
                "generate_study_items: items field not a list for file=%s", file_id
            )
            item_set.status = ContentStatus.failed
            item_set.error_code = str(error_code) if error_code else None
            item_set.error_message = str(error_message) if error_message else None
            await _reconcile_credit(db, user_id, credit_estimate, total_tokens, credit_source, credit_batch_ids)
            await db.commit()
            return

        items: list[StudyItem] = []
        for idx, raw_item in enumerate(raw_items):
            built = _build_study_item(
                raw_item,
                item_set_id=item_set.id,
                order=idx,
                default_item_type=item_type,
            )
            if built is not None:
                items.append(built)

        if error_code in {"insufficient_source", "count_exceeded"}:
            item_set.status = ContentStatus.failed
            item_set.error_code = str(error_code)
            item_set.error_message = (
                str(error_message) if error_message else None
            )
            await _reconcile_credit(db, user_id, credit_estimate, total_tokens, credit_source, credit_batch_ids)
            await db.commit()
            return

        if not items:
            logger.error(
                "generate_study_items: no valid items parsed for file=%s type=%s",
                file_id,
                item_type,
            )
            item_set.status = ContentStatus.failed
            item_set.error_code = str(error_code) if error_code else None
            item_set.error_message = str(error_message) if error_message else None
            await _reconcile_credit(db, user_id, credit_estimate, total_tokens, credit_source, credit_batch_ids)
            await db.commit()
            return

        await db.execute(
            delete(StudyItem).where(StudyItem.item_set_id == item_set.id)
        )
        db.add_all(items)
        item_set.status = ContentStatus.completed
        item_set.generated_at = datetime.now(timezone.utc)
        item_set.model_used = STUDY_MODEL
        item_set.error_code = str(error_code) if error_code else None
        item_set.error_message = str(error_message) if error_message else None
        await _reconcile_credit(db, user_id, credit_estimate, total_tokens, credit_source, credit_batch_ids)
        await db.commit()

        logger.info(
            "generate_study_items: completed for file=%s type=%s diff=%s (%d items)",
            file_id,
            item_type,
            difficulty,
            len(items),
        )

    except Exception as exc:
        logger.exception(
            "generate_study_items: failed for file=%s type=%s diff=%s: %s",
            file_id,
            item_type,
            difficulty,
            exc,
        )
        try:
            item_set.status = ContentStatus.failed
            await db.commit()
        except Exception:
            pass


async def generate_concept_notes(
    file_id: str,
    db: AsyncSession,
    *,
    user_id: str = "",
    credit_estimate: float = 0,
    credit_source: str = "tier",
    credit_batch_ids: list[str] | None = None,
) -> None:
    concept_note = await _get_or_create_concept_note(db, file_id)

    concept_note.status = ContentStatus.generating
    await db.commit()

    try:
        file_result = await db.execute(select(File).where(File.id == file_id))
        file = file_result.scalar_one_or_none()

        if file is None:
            logger.error("generate_concept_notes: file %s not found", file_id)
            concept_note.status = ContentStatus.failed
            await db.commit()
            return

        parsed_doc: ParsedDocument | None = file.parsed_document
        text = (parsed_doc.normalized_text or "") if parsed_doc else ""

        if len(text) < _MIN_TEXT_CHARS:
            logger.warning(
                "generate_concept_notes: file %s text too short (%d chars)",
                file_id,
                len(text),
            )
            concept_note.status = ContentStatus.failed
            await db.commit()
            return

        if len(text) > _MAX_TEXT_CHARS:
            text = text[:_MAX_TEXT_CHARS]

        prompt = CONCEPT_NOTES_PROMPT.format(document_text=text)
        raw_text, total_tokens = await _collect_ai_response(prompt)

        try:
            data = json.loads(_strip_json_fences(raw_text))
        except json.JSONDecodeError:
            logger.warning("generate_concept_notes: JSON parse failed on first attempt for file %s, retrying", file_id)
            retry_prompt = (
                prompt
                + "\n\n[중요] 반드시 순수 JSON 객체만 출력하세요."
                ' 코드 펜스, 마크다운, 설명 없이 {"concepts": [...]} 형식의 JSON만 반환하세요.'
            )
            raw_text2, retry_tokens = await _collect_ai_response(retry_prompt)
            total_tokens += retry_tokens
            try:
                data = json.loads(_strip_json_fences(raw_text2))
            except json.JSONDecodeError as exc:
                logger.error("generate_concept_notes: JSON parse failed on retry for file %s: %s", file_id, exc)
                concept_note.status = ContentStatus.failed
                await _reconcile_credit(db, user_id, credit_estimate, total_tokens, credit_source, credit_batch_ids)
                await db.commit()
                return

        raw_concepts = data.get("concepts", [])
        if not isinstance(raw_concepts, list):
            logger.error("generate_concept_notes: concepts field not a list for file %s", file_id)
            concept_note.status = ContentStatus.failed
            await _reconcile_credit(db, user_id, credit_estimate, total_tokens, credit_source, credit_batch_ids)
            await db.commit()
            return

        concepts = []
        for i, raw in enumerate(raw_concepts):
            if not isinstance(raw, dict):
                continue
            name = str(raw.get("name", "")).strip()
            explanation = str(raw.get("explanation", "")).strip()
            if not name or not explanation:
                continue
            difficulty = str(raw.get("difficulty", "medium")).strip().lower()
            if difficulty not in ("easy", "medium", "hard"):
                difficulty = "medium"
            raw_kp = raw.get("key_points", [])
            key_points = (
                [str(p).strip() for p in raw_kp if isinstance(p, (str, int, float)) and str(p).strip()]
                if isinstance(raw_kp, list)
                else []
            )
            raw_kw = raw.get("keywords", [])
            keywords = (
                [str(k).strip() for k in raw_kw if isinstance(k, (str, int, float)) and str(k).strip()]
                if isinstance(raw_kw, list)
                else []
            )
            concepts.append({
                "id": f"concept-{i + 1}",
                "name": name,
                "explanation": explanation,
                "key_points": key_points,
                "keywords": keywords,
                "difficulty": difficulty,
            })

        if not concepts:
            logger.error("generate_concept_notes: no valid concepts parsed for file %s", file_id)
            concept_note.status = ContentStatus.failed
            await _reconcile_credit(db, user_id, credit_estimate, total_tokens, credit_source, credit_batch_ids)
            await db.commit()
            return

        concept_note.data = {"concepts": concepts}
        concept_note.status = ContentStatus.completed
        concept_note.generated_at = datetime.now(timezone.utc)
        concept_note.model_used = STUDY_MODEL
        await _reconcile_credit(db, user_id, credit_estimate, total_tokens, credit_source, credit_batch_ids)
        await db.commit()

        logger.info(
            "generate_concept_notes: completed for file %s (%d concepts)",
            file_id,
            len(concepts),
        )

    except Exception as exc:
        logger.exception("generate_concept_notes: failed for file %s: %s", file_id, exc)
        try:
            concept_note.status = ContentStatus.failed
            await db.commit()
        except Exception:
            pass



async def _get_parsed_text(db: AsyncSession, file_id: str) -> str | None:
    result = await db.execute(
        select(ParsedDocument.normalized_text).where(ParsedDocument.file_id == file_id)
    )
    row = result.scalar_one_or_none()
    return row if row else None


async def stream_study_content(
    db: AsyncSession,
    file_id: str,
    user_id: str,
    content_type: str,
    content_record,
    prompt: str,
    schema: dict,
    system_message: str,
    credit_estimate: float,
    credit_source: str,
    credit_batch_ids: list[str],
    persist_fn,
    celery_task_name: str,
    celery_args: list,
) -> AsyncGenerator[str, None]:
    generation_completed = False
    try:
        yield sse_data({"type": "stage", "stage": "analyzing"})

        parsed = await _get_parsed_text(db, file_id)
        if not parsed:
            raise ValueError("Document text not available")

        full_prompt = prompt.format(document_text=parsed[:_MAX_TEXT_CHARS])

        yield sse_data({"type": "stage", "stage": "generating"})
        yield sse_data({"type": "thinking_start"})

        primary_model = STUDY_MODEL
        fallback_model = settings.eco_generation_model

        ai_result = None
        tokens_used = 0

        stream_iter = stream_ai_structured_with_thinking(
            prompt=full_prompt,
            schema=schema,
            system_message=system_message,
            primary_model=primary_model,
            fallback_model=fallback_model,
            max_tokens=8192,
            reasoning_effort="low",
            thinking_level="MEDIUM",
        )

        async with asyncio.timeout(settings.generation_timeout):
            async for event in stream_iter:
                etype = event.get("type")
                if etype == "thinking":
                    text = event.get("text") or ""
                    if isinstance(text, str) and text:
                        yield sse_data({"type": "thinking_chunk", "text": text})
                elif etype == "result":
                    data = event.get("data")
                    if isinstance(data, dict):
                        ai_result = data
                    tokens_raw = event.get("tokens_used") or 0
                    tokens_used = int(tokens_raw) if isinstance(tokens_raw, (int, float)) else 0

        yield sse_data({"type": "thinking_end"})

        if ai_result is None:
            raise ValueError("AI stream ended without a result")

        await persist_fn(db, content_record, ai_result)

        await _reconcile_credit(db, user_id, credit_estimate, tokens_used, credit_source, credit_batch_ids)

        content_record.status = ContentStatus.completed
        content_record.generated_at = datetime.now(timezone.utc)
        content_record.model_used = primary_model
        await db.commit()
        generation_completed = True

        yield sse_data({"type": "result", "data": ai_result})
        yield sse_done()

    except GeneratorExit:
        raise
    except Exception as e:
        logger.exception("stream_study_content error for %s file=%s: %s", content_type, file_id, e)
        if not generation_completed:
            try:
                from app.workers.celery_app import dispatch_task
                dispatch_task(celery_task_name, celery_args)
                logger.info("Dispatched Celery fallback %s for file=%s", celery_task_name, file_id)
            except Exception as fallback_err:
                logger.error("Celery fallback failed: %s", fallback_err)
                content_record.status = ContentStatus.failed
                try:
                    await db.commit()
                except Exception:
                    pass
        yield sse_error(str(e))


async def persist_stream_summary(db: AsyncSession, record: StudySummary, data: dict) -> None:
    record.content = data.get("content", "")


async def persist_stream_flashcards(db: AsyncSession, record: StudyFlashcardSet, data: dict) -> None:
    items = data.get("items", [])
    for i, item in enumerate(items):
        card = StudyFlashcard(
            flashcard_set_id=record.id,
            front=item.get("front", ""),
            back=item.get("back", ""),
            order=i,
        )
        db.add(card)


async def persist_stream_mindmap(db: AsyncSession, record: StudyMindmap, data: dict) -> None:
    record.data = data


async def persist_stream_concept_notes(db: AsyncSession, record: StudyConceptNote, data: dict) -> None:
    record.data = data
