import logging
import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.diagram import ConceptDiagram
from app.schemas.diagram import DiagramResponse
from app.utils.ai_client import call_ai_with_fallback
from app.prompts.diagram import get_system_prompt, build_user_prompt

logger = logging.getLogger(__name__)

DIAGRAM_TYPES = [
    "mindmap",
]

VALID_MERMAID_PREFIXES = (
    "flowchart",
    "graph",
)

DIAGRAM_SCHEMA = {
    "type": "object",
    "required": ["diagram_type", "mermaid_code", "title"],
    "properties": {
        "diagram_type": {
            "type": "string",
            "enum": DIAGRAM_TYPES,
        },
        "mermaid_code": {"type": "string"},
        "title": {"type": "string"},
    },
    "additionalProperties": False,
}


class DiagramGenerationError(Exception):
    pass


_MERMAID_FENCE_RE = re.compile(r"^```(?:mermaid)?\s*\n?(.*?)\n?```$", re.DOTALL)


def _clean_mermaid_code(code: str) -> str:
    stripped = code.strip()
    match = _MERMAID_FENCE_RE.match(stripped)
    if match:
        return match.group(1).strip()
    return stripped


def _is_valid_mermaid(code: str) -> bool:
    stripped = code.strip()
    return any(stripped.startswith(prefix) for prefix in VALID_MERMAID_PREFIXES)


def _build_schema_for_type(requested_type: str | None) -> dict:
    if requested_type is None:
        return DIAGRAM_SCHEMA
    return {
        "type": "object",
        "required": ["diagram_type", "mermaid_code", "title"],
        "properties": {
            "diagram_type": {
                "type": "string",
                "enum": [requested_type],
            },
            "mermaid_code": {"type": "string"},
            "title": {"type": "string"},
        },
        "additionalProperties": False,
    }


async def get_cached_diagram(
    db: AsyncSession, user_id: str, concept_key: str, diagram_type: str | None = None
) -> ConceptDiagram | None:
    query = select(ConceptDiagram).where(
        ConceptDiagram.user_id == user_id,
        ConceptDiagram.concept_key == concept_key,
    )
    if diagram_type is not None:
        query = query.where(ConceptDiagram.diagram_type == diagram_type)
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def generate_diagram(
    db: AsyncSession,
    user_id: str,
    concept_key: str,
    concept_label: str,
    category_tag: str | None = None,
    requested_diagram_type: str | None = None,
) -> DiagramResponse:
    prompt = build_user_prompt(concept_label, category_tag)
    schema = _build_schema_for_type(requested_diagram_type)
    system_prompt = get_system_prompt()

    ai_result = await call_ai_with_fallback(
        prompt,
        schema,
        primary_model=settings.balanced_generation_model,
        fallback_model=settings.eco_generation_model,
        system_message=system_prompt,
        max_tokens=2048,
        cache_key="diagram_gen_v1",
        strict=True,
    )

    mermaid_code: str = _clean_mermaid_code(ai_result.get("mermaid_code", ""))
    diagram_type: str = ai_result.get("diagram_type", "")
    title: str = ai_result.get("title", concept_label)

    if not _is_valid_mermaid(mermaid_code):
        logger.warning(
            "Invalid Mermaid syntax on first attempt for concept_key=%s, retrying",
            concept_key,
        )
        fix_prompt = (
            f"{prompt}\n\n"
            "이전 응답의 Mermaid 구문이 유효하지 않습니다. "
            "위 개념을 그대로 유지하면서 올바른 Mermaid 구문으로 다시 생성하세요."
        )
        ai_result = await call_ai_with_fallback(
            fix_prompt,
            schema,
            primary_model=settings.balanced_generation_model,
            fallback_model=settings.eco_generation_model,
            system_message=system_prompt,
            max_tokens=2048,
            cache_key="diagram_gen_v1",
            strict=True,
        )
        mermaid_code = _clean_mermaid_code(ai_result.get("mermaid_code", ""))
        diagram_type = ai_result.get("diagram_type", diagram_type)
        title = ai_result.get("title", title)

        if not _is_valid_mermaid(mermaid_code):
            raise DiagramGenerationError(
                "Failed to generate valid Mermaid diagram after retry"
            )

    existing = await get_cached_diagram(db, user_id, concept_key, diagram_type)
    if existing is None:
        diagram = ConceptDiagram(
            user_id=user_id,
            concept_key=concept_key,
            concept_label=concept_label,
            diagram_type=diagram_type,
            mermaid_code=mermaid_code,
            title=title,
        )
        db.add(diagram)
        await db.flush()
    else:
        existing.concept_label = concept_label
        existing.mermaid_code = mermaid_code
        existing.title = title
        await db.flush()
        diagram = existing

    return DiagramResponse(
        concept_key=diagram.concept_key,
        concept_label=diagram.concept_label,
        diagram_type=diagram.diagram_type,
        mermaid_code=diagram.mermaid_code,
        title=diagram.title,
        cached=False,
        created_at=diagram.created_at,
    )
