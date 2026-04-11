import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.diagram import ConceptDiagram
from app.models.quiz import AnswerLog, QuizItem, Judgement
from app.schemas.diagram import DiagramResponse
from app.utils.ai_client import call_ai_structured

logger = logging.getLogger(__name__)

DIAGRAM_TYPES = [
    "flowchart",
    "mindmap",
    "sequenceDiagram",
    "stateDiagram",
    "classDiagram",
]

VALID_MERMAID_PREFIXES = (
    "flowchart",
    "mindmap",
    "sequenceDiagram",
    "stateDiagram",
    "classDiagram",
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

DIAGRAM_SYSTEM_PROMPT = """당신은 학습 개념을 시각적 다이어그램으로 요약하는 전문가입니다.
사용자의 학습 내용과 오답 패턴을 분석하여 가장 적합한 다이어그램 유형을 선택하고,
Mermaid 문법으로 다이어그램을 생성하세요.
- 다이어그램의 모든 레이블과 텍스트는 반드시 한국어로 작성하세요.
- 노드 수는 최대 30개로 제한하세요.
- 사용 가능한 다이어그램 유형: flowchart, mindmap, sequenceDiagram, stateDiagram, classDiagram
- 개념 선택 기준: 절차/흐름 → flowchart, 개념 구조/관계 → mindmap, 순서/상호작용 → sequenceDiagram, 상태 전이 → stateDiagram, 클래스/구조 → classDiagram
- 유효한 Mermaid 문법만 사용하세요."""


class DiagramGenerationError(Exception):
    pass


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


def _build_system_prompt_for_type(requested_type: str | None) -> str:
    if requested_type is None:
        return DIAGRAM_SYSTEM_PROMPT
    type_hint = f"\n반드시 '{requested_type}' 유형의 다이어그램만 생성하세요. 다른 유형은 사용하지 마세요."
    return DIAGRAM_SYSTEM_PROMPT + type_hint


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


async def get_wrong_answer_context(
    db: AsyncSession, user_id: str, concept_key: str, limit: int = 5
) -> list[dict]:
    result = await db.execute(
        select(AnswerLog, QuizItem)
        .join(QuizItem, AnswerLog.quiz_item_id == QuizItem.id)
        .where(
            QuizItem.concept_key == concept_key,
            AnswerLog.user_id == user_id,
            AnswerLog.judgement.in_([Judgement.incorrect, Judgement.partial]),
        )
        .order_by(AnswerLog.created_at.desc())
        .limit(limit)
    )
    rows = result.all()
    return [
        {
            "question_text": qi.question_text[:200],
            "user_answer": al.user_answer_raw,
            "error_type": al.error_type.value if al.error_type else None,
            "missing_points": al.missing_points_json,
        }
        for al, qi in rows
    ]


async def generate_diagram(
    db: AsyncSession,
    user_id: str,
    concept_key: str,
    concept_label: str,
    category_tag: str | None = None,
    requested_diagram_type: str | None = None,
) -> DiagramResponse:
    wrong_answers = await get_wrong_answer_context(db, user_id, concept_key, limit=5)

    wrong_answer_section = ""
    if wrong_answers:
        lines = []
        for i, wa in enumerate(wrong_answers, 1):
            lines.append(f"오답 {i}:")
            lines.append(f"  질문: {wa['question_text']}")
            if wa["user_answer"]:
                lines.append(f"  사용자 답변: {wa['user_answer']}")
            if wa["error_type"]:
                lines.append(f"  오류 유형: {wa['error_type']}")
            if wa["missing_points"]:
                lines.append(f"  누락 포인트: {wa['missing_points']}")
        wrong_answer_section = "\n".join(lines)
    else:
        wrong_answer_section = "오답 데이터 없음"

    category_line = f"카테고리: {category_tag}\n" if category_tag else ""
    prompt = (
        f"개념: {concept_label}\n"
        f"{category_line}"
        f"\n오답 패턴:\n{wrong_answer_section}\n"
        f"\n위 개념과 오답 패턴을 분석하여 학습에 도움이 되는 Mermaid 다이어그램을 생성하세요."
    )

    schema = _build_schema_for_type(requested_diagram_type)
    system_prompt = _build_system_prompt_for_type(requested_diagram_type)

    ai_result = await call_ai_structured(
        prompt,
        schema,
        system_message=system_prompt,
        max_tokens=2048,
        cache_key="diagram_gen_v1",
    )

    mermaid_code: str = ai_result.get("mermaid_code", "")
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
        ai_result = await call_ai_structured(
            fix_prompt,
            schema,
            system_message=system_prompt,
            max_tokens=2048,
            cache_key="diagram_gen_v1",
        )
        mermaid_code = ai_result.get("mermaid_code", "")
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
