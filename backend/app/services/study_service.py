import hashlib
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
    NODE_EXPLANATION_PROMPT,
    STUDY_MODEL,
    SUMMARY_PROMPT,
)
from app.services.usage_service import UsageService
from app.tier_config import calculate_credit_cost
from app.utils.ai_client import get_gemini_client

logger = logging.getLogger(__name__)

_MAX_TEXT_CHARS = 100_000
_MIN_TEXT_CHARS = 100

_NODE_EXPLAIN_EXCERPT_WINDOW_CHARS = 800
_NODE_EXPLAIN_FALLBACK_EXCERPT_CHARS = 1600
_NODE_EXPLAIN_MAX_OUTPUT_TOKENS = 512
_NODE_EXPLAIN_CACHE_TTL_SECONDS = 60 * 60 * 24 * 30
_NODE_EXPLAIN_CACHE_PREFIX = "mindmap_node_explain"


def _strip_json_fences(text: str) -> str:
    text = text.strip()
    match = re.match(r"^```(?:json)?\s*\n?(.*?)\n?```\s*$", text, re.DOTALL)
    if match:
        return match.group(1).strip()
    return text


async def _collect_ai_response(
    prompt: str,
    *,
    max_output_tokens: int = 8192,
) -> tuple[str, int]:
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
                    await _reconcile_credit(db, user_id, credit_estimate, 0)
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

    await _reconcile_credit(db, user_id, credit_estimate, total_tokens)
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
