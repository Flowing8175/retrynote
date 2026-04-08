import uuid
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio

from app.models.diagram import ConceptDiagram
from app.models.quiz import (
    AnswerLog,
    Judgement,
    QuizItem,
    QuestionType,
    QuizSession,
    QuizMode,
    SourceMode,
    QuizSessionStatus,
)
from app.services.diagram_service import (
    DiagramGenerationError,
    generate_diagram,
    get_cached_diagram,
    get_wrong_answer_context,
)

VALID_AI_RESPONSE = {
    "diagram_type": "flowchart",
    "mermaid_code": "flowchart TD\n    A[시작] --> B[끝]",
    "title": "테스트 다이어그램",
}

INVALID_AI_RESPONSE = {
    "diagram_type": "flowchart",
    "mermaid_code": "invalid syntax here",
    "title": "잘못된 다이어그램",
}


@pytest_asyncio.fixture
async def concept_diagram(db_session, test_user):
    diagram = ConceptDiagram(
        id=str(uuid.uuid4()),
        user_id=test_user.id,
        concept_key="test_concept",
        concept_label="테스트 개념",
        diagram_type="flowchart",
        mermaid_code="flowchart TD\n    A --> B",
        title="기존 다이어그램",
    )
    db_session.add(diagram)
    await db_session.commit()
    await db_session.refresh(diagram)
    return diagram


@pytest_asyncio.fixture
async def quiz_session_with_items(db_session, test_user):
    session = QuizSession(
        id=str(uuid.uuid4()),
        user_id=test_user.id,
        mode=QuizMode.normal,
        source_mode=SourceMode.document_based,
        status=QuizSessionStatus.ready,
        question_count=6,
        generation_model_name="gpt-4o",
    )
    db_session.add(session)
    await db_session.flush()

    items = []
    for i in range(6):
        item = QuizItem(
            id=str(uuid.uuid4()),
            quiz_session_id=session.id,
            item_order=i + 1,
            question_type=QuestionType.short_answer,
            question_text=f"질문 {i + 1}",
            concept_key="test_concept",
            concept_label="테스트 개념",
        )
        db_session.add(item)
        items.append(item)

    await db_session.flush()

    logs = []
    for i, item in enumerate(items):
        log = AnswerLog(
            id=str(uuid.uuid4()),
            quiz_item_id=item.id,
            quiz_session_id=session.id,
            user_id=test_user.id,
            user_answer_raw=f"오답 {i + 1}",
            judgement=Judgement.incorrect,
        )
        db_session.add(log)
        logs.append(log)

    await db_session.commit()
    return session, items, logs


@pytest.mark.asyncio
async def test_cache_hit(db_session, test_user, concept_diagram):
    result = await get_cached_diagram(db_session, test_user.id, "test_concept")
    assert result is not None
    assert result.concept_key == "test_concept"
    assert result.user_id == test_user.id


@pytest.mark.asyncio
async def test_cache_miss(db_session, test_user):
    result = await get_cached_diagram(db_session, test_user.id, "nonexistent_concept")
    assert result is None


@pytest.mark.asyncio
async def test_generate_creates_db_row(db_session, test_user):
    with patch(
        "app.services.diagram_service.call_ai_structured",
        new_callable=AsyncMock,
        return_value=VALID_AI_RESPONSE,
    ):
        response = await generate_diagram(
            db_session, test_user.id, "new_concept", "새로운 개념"
        )

    assert response.concept_key == "new_concept"
    assert response.diagram_type == "flowchart"
    assert response.cached is False

    stored = await get_cached_diagram(db_session, test_user.id, "new_concept")
    assert stored is not None
    assert stored.mermaid_code == VALID_AI_RESPONSE["mermaid_code"]


@pytest.mark.asyncio
async def test_generate_upserts_existing_row(db_session, test_user, concept_diagram):
    updated_response = {
        "diagram_type": "mindmap",
        "mermaid_code": "mindmap\n    root((중심))",
        "title": "업데이트된 다이어그램",
    }
    with patch(
        "app.services.diagram_service.call_ai_structured",
        new_callable=AsyncMock,
        return_value=updated_response,
    ):
        response = await generate_diagram(
            db_session, test_user.id, "test_concept", "테스트 개념"
        )

    assert response.diagram_type == "mindmap"
    assert response.title == "업데이트된 다이어그램"

    stored = await get_cached_diagram(db_session, test_user.id, "test_concept")
    assert stored is not None
    assert stored.diagram_type == "mindmap"


@pytest.mark.asyncio
async def test_retry_on_invalid_syntax(db_session, test_user):
    call_count = 0

    async def mock_ai(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return INVALID_AI_RESPONSE
        return VALID_AI_RESPONSE

    with patch("app.services.diagram_service.call_ai_structured", side_effect=mock_ai):
        response = await generate_diagram(
            db_session, test_user.id, "retry_concept", "재시도 개념"
        )

    assert call_count == 2
    assert response.mermaid_code == VALID_AI_RESPONSE["mermaid_code"]


@pytest.mark.asyncio
async def test_raises_after_two_invalid_responses(db_session, test_user):
    with patch(
        "app.services.diagram_service.call_ai_structured",
        new_callable=AsyncMock,
        return_value=INVALID_AI_RESPONSE,
    ):
        with pytest.raises(DiagramGenerationError):
            await generate_diagram(db_session, test_user.id, "bad_concept", "나쁜 개념")


@pytest.mark.asyncio
async def test_zero_wrong_answers_no_crash(db_session, test_user):
    with patch(
        "app.services.diagram_service.call_ai_structured",
        new_callable=AsyncMock,
        return_value=VALID_AI_RESPONSE,
    ):
        response = await generate_diagram(
            db_session, test_user.id, "no_wrong_concept", "오답 없는 개념"
        )

    assert response.concept_key == "no_wrong_concept"


@pytest.mark.asyncio
async def test_wrong_answer_limit(db_session, test_user, quiz_session_with_items):
    results = await get_wrong_answer_context(
        db_session, test_user.id, "test_concept", limit=5
    )
    assert len(results) <= 5
    assert len(results) == 5


@pytest.mark.asyncio
async def test_wrong_answer_context_fields(
    db_session, test_user, quiz_session_with_items
):
    results = await get_wrong_answer_context(
        db_session, test_user.id, "test_concept", limit=5
    )
    assert len(results) > 0
    for entry in results:
        assert "question_text" in entry
        assert "user_answer" in entry
        assert "error_type" in entry
        assert "missing_points" in entry
