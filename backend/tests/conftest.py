import asyncio
import uuid
from datetime import datetime
from unittest.mock import AsyncMock, patch, MagicMock

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models import (
    User,
    UserRole,
    AdminSettings,
    Folder,
    File,
    FileSourceType,
    FileStatus,
    ParsedDocument,
    DocumentChunk,
    QuizSession,
    QuizSessionStatus,
    QuizMode,
    SourceMode,
    QuizSessionFile,
    QuizItem,
    QuestionType,
    AnswerLog,
    Judgement,
    ErrorType,
    Objection,
    ObjectionStatus,
    WeakPoint,
    DashboardSnapshot,
    SystemLog,
    AdminAuditLog,
    Announcement,
    EmbeddingStore,
    PasswordResetToken,
    ImpersonationSession,
    DraftAnswer,
    Job,
)
from app.middleware.auth import hash_password, create_access_token, create_admin_token


SQLALCHEMY_DATABASE_URL = "sqlite+aiosqlite://"

engine_test = create_async_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = async_sessionmaker(
    engine_test, class_=AsyncSession, expire_on_commit=False
)


@pytest_asyncio.fixture(autouse=True)
async def setup_database():
    async with engine_test.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine_test.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


async def override_get_db():
    async with TestingSessionLocal() as session:
        yield session
        await session.commit()


app.dependency_overrides[get_db] = override_get_db


@pytest_asyncio.fixture
async def db_session():
    async with TestingSessionLocal() as session:
        yield session


@pytest_asyncio.fixture
async def client(db_session):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def test_user(db_session):
    user = User(
        id=str(uuid.uuid4()),
        username="testuser",
        email="testuser@example.com",
        password_hash=hash_password("TestPass123!"),
        role=UserRole.user,
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def test_user_token(test_user):
    return create_access_token(test_user.id, test_user.role.value)


@pytest_asyncio.fixture
async def auth_client(client, test_user_token):
    client.headers["Authorization"] = f"Bearer {test_user_token}"
    return client


@pytest_asyncio.fixture
async def admin_user(db_session):
    user = User(
        id=str(uuid.uuid4()),
        username="adminuser",
        email="admin@example.com",
        password_hash=hash_password("AdminPass123!"),
        role=UserRole.admin,
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def admin_token(admin_user):
    return create_access_token(admin_user.id, admin_user.role.value)


@pytest_asyncio.fixture
async def admin_client(client, admin_token):
    client.headers["Authorization"] = f"Bearer {admin_token}"
    return client


@pytest_asyncio.fixture
async def verified_admin_client(client, admin_user, admin_token):
    admin_jwt = create_admin_token(admin_user.id)
    client.headers["Authorization"] = f"Bearer {admin_token}"
    client.headers["X-Admin-Token"] = admin_jwt
    return client


@pytest_asyncio.fixture
async def verified_super_admin_client(client, super_admin_user, super_admin_token):
    admin_jwt = create_admin_token(super_admin_user.id)
    client.headers["Authorization"] = f"Bearer {super_admin_token}"
    client.headers["X-Admin-Token"] = admin_jwt
    return client


@pytest_asyncio.fixture
async def super_admin_user(db_session):
    user = User(
        id=str(uuid.uuid4()),
        username="superadmin",
        email="superadmin@example.com",
        password_hash=hash_password("SuperAdmin123!"),
        role=UserRole.super_admin,
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def super_admin_token(super_admin_user):
    return create_access_token(super_admin_user.id, super_admin_user.role.value)


@pytest_asyncio.fixture
async def super_admin_client(client, super_admin_token):
    client.headers["Authorization"] = f"Bearer {super_admin_token}"
    return client


@pytest_asyncio.fixture
async def ready_file(db_session, test_user):
    file = File(
        id=str(uuid.uuid4()),
        user_id=test_user.id,
        original_filename="test.pdf",
        file_type="pdf",
        file_size_bytes=1024,
        source_type=FileSourceType.upload,
        status=FileStatus.ready,
        is_searchable=True,
        is_quiz_eligible=True,
    )
    db_session.add(file)
    await db_session.commit()
    await db_session.refresh(file)
    return file


@pytest_asyncio.fixture
async def ready_file_with_text(db_session, test_user):
    file = File(
        id=str(uuid.uuid4()),
        user_id=test_user.id,
        original_filename="notes.txt",
        file_type="txt",
        file_size_bytes=500,
        source_type=FileSourceType.manual_text,
        status=FileStatus.ready,
        is_searchable=True,
        is_quiz_eligible=True,
    )
    db_session.add(file)
    parsed = ParsedDocument(
        id=str(uuid.uuid4()),
        file_id=file.id,
        raw_text="사회복지실천기술에서 면담기법은 핵심 요소이다.",
        normalized_text="사회복지실천기술에서 면담기법은 핵심 요소이다.",
        language="ko",
        page_count=1,
        parser_name="raw",
    )
    db_session.add(parsed)
    chunk = DocumentChunk(
        id=str(uuid.uuid4()),
        file_id=file.id,
        parsed_document_id=parsed.id,
        chunk_index=0,
        text="사회복지실천기술에서 면담기법은 핵심 요소이다.",
        token_count=15,
        is_active=True,
    )
    db_session.add(chunk)
    await db_session.commit()
    await db_session.refresh(file)
    return file


def make_quiz_items(session_id, count=3, question_type=QuestionType.multiple_choice):
    items = []
    for i in range(count):
        item = QuizItem(
            id=str(uuid.uuid4()),
            quiz_session_id=session_id,
            item_order=i + 1,
            question_type=question_type,
            question_text=f"Test question {i + 1}",
            options_json={
                "choices": [
                    {"label": "A", "text": f"Option A for Q{i + 1}"},
                    {"label": "B", "text": f"Option B for Q{i + 1}"},
                    {"label": "C", "text": f"Option C for Q{i + 1}"},
                    {"label": "D", "text": f"Option D for Q{i + 1}"},
                ]
            }
            if question_type == QuestionType.multiple_choice
            else None,
            correct_answer_json={"answer": "A"},
            explanation_text=f"Explanation for Q{i + 1}",
            concept_key=f"test_concept_{i + 1}",
            concept_label=f"Test Concept {i + 1}",
            category_tag="test_category",
            difficulty="medium",
        )
        items.append(item)
    return items


@pytest_asyncio.fixture
async def quiz_session_ready(db_session, test_user, ready_file):
    session = QuizSession(
        id=str(uuid.uuid4()),
        user_id=test_user.id,
        mode=QuizMode.normal,
        source_mode=SourceMode.document_based,
        status=QuizSessionStatus.ready,
        question_count=3,
        generation_model_name="gpt-4o",
        grading_model_name="gpt-4o-mini",
    )
    db_session.add(session)
    await db_session.flush()

    sf = QuizSessionFile(
        id=str(uuid.uuid4()),
        quiz_session_id=session.id,
        file_id=ready_file.id,
    )
    db_session.add(sf)

    items = make_quiz_items(session.id, count=3)
    for item in items:
        db_session.add(item)

    await db_session.commit()
    await db_session.refresh(session)
    return session, items


@pytest_asyncio.fixture
async def exam_session_ready(db_session, test_user, ready_file):
    session = QuizSession(
        id=str(uuid.uuid4()),
        user_id=test_user.id,
        mode=QuizMode.exam,
        source_mode=SourceMode.document_based,
        status=QuizSessionStatus.ready,
        question_count=3,
        generation_model_name="gpt-4o",
        grading_model_name="gpt-4o-mini",
    )
    db_session.add(session)
    await db_session.flush()

    sf = QuizSessionFile(
        id=str(uuid.uuid4()),
        quiz_session_id=session.id,
        file_id=ready_file.id,
    )
    db_session.add(sf)

    items = make_quiz_items(session.id, count=3)
    for item in items:
        db_session.add(item)

    await db_session.commit()
    await db_session.refresh(session)
    return session, items


MOCK_GENERATION_RESULT = {
    "questions": [
        {
            "question_type": "multiple_choice",
            "question_text": "사회복지실천기술에서 면담의 핵심 목적은?",
            "options": {
                "choices": [
                    {"label": "A", "text": "정보 수집"},
                    {"label": "B", "text": "문제 진단"},
                    {"label": "C", "text": "관계 형성"},
                    {"label": "D", "text": "모두 해당"},
                ]
            },
            "correct_answer": {"answer": "D"},
            "explanation": "면담은 정보 수집, 문제 진단, 관계 형성을 모두 포함합니다.",
            "concept_key": "social_work_interview",
            "concept_label": "사회복지실천 - 면담기법",
            "category_tag": "social_work",
            "difficulty": "medium",
            "source_refs": [{"file_id": "test", "page": 1}],
            "low_confidence_source": False,
        },
        {
            "question_type": "ox",
            "question_text": "사회복지사는 클라이언트의 자기결정권을 존중해야 한다.",
            "options": None,
            "correct_answer": {"answer": "O"},
            "explanation": "자기결정권은 사회복지실천의 핵심 가치입니다.",
            "concept_key": "self_determination",
            "concept_label": "사회복지실천 - 자기결정권",
            "category_tag": "social_work",
            "difficulty": "easy",
            "source_refs": [],
            "low_confidence_source": False,
        },
        {
            "question_type": "short_answer",
            "question_text": "면담에서 개방형 질문의 장점을 서술하시오.",
            "options": None,
            "correct_answer": {
                "answer": "클라이언트가 자유롭게 응답할 수 있어 더 풍부한 정보를 얻을 수 있다",
                "accepted_answers": [
                    "클라이언트가 자유롭게 응답할 수 있어 더 풍부한 정보를 얻을 수 있다",
                    "풍부한 정보 수집 가능",
                ],
            },
            "explanation": "개방형 질문은 클라이언트의 관점을 이해하는 데 도움이 됩니다.",
            "concept_key": "open_question",
            "concept_label": "면담기법 - 개방형질문",
            "category_tag": "social_work",
            "difficulty": "medium",
            "source_refs": [],
            "low_confidence_source": False,
        },
    ]
}

MOCK_GRADING_RESULT = {
    "judgement": "correct",
    "score_awarded": 1.0,
    "max_score": 1.0,
    "normalized_user_answer": "d",
    "accepted_answers": ["d"],
    "grading_confidence": 0.95,
    "grading_rationale": "정답과 일치합니다.",
    "missing_points": None,
    "error_type": None,
    "suggested_feedback": "잘 하셨습니다!",
}

MOCK_GRADING_INCORRECT_RESULT = {
    "judgement": "incorrect",
    "score_awarded": 0.0,
    "max_score": 1.0,
    "normalized_user_answer": "a",
    "accepted_answers": ["d"],
    "grading_confidence": 0.95,
    "grading_rationale": "정답이 아닙니다.",
    "missing_points": ["모두 해당이라는 점을 고려해야 합니다."],
    "error_type": "concept_confusion",
    "suggested_feedback": "면담의 다양한 목적을 고려해보세요.",
}

MOCK_GRADING_PARTIAL_RESULT = {
    "judgement": "partial",
    "score_awarded": 0.5,
    "max_score": 1.0,
    "normalized_user_answer": "정보 수집과 관계 형성",
    "accepted_answers": ["모두 해당"],
    "grading_confidence": 0.7,
    "grading_rationale": "부분적으로 정답입니다.",
    "missing_points": ["문제 진단도 포함됩니다."],
    "error_type": "missing_keyword",
    "suggested_feedback": "문제 진단도 면담의 목적에 포함됩니다.",
}

MOCK_OBJECTION_UPHELD_RESULT = {
    "decision": "upheld",
    "reasoning": "사용자 답안이 정답과 의미적으로 동일합니다.",
    "updated_judgement": "correct",
    "updated_score_awarded": 1.0,
    "updated_error_type": None,
    "should_apply": True,
}

MOCK_OBJECTION_REJECTED_RESULT = {
    "decision": "rejected",
    "reasoning": "사용자 답안이 정답과 다릅니다.",
    "updated_judgement": "incorrect",
    "updated_score_awarded": 0.0,
    "updated_error_type": "concept_confusion",
    "should_apply": False,
}


@pytest.fixture(autouse=True)
def mock_redis_state():
    mock_pipeline = MagicMock()
    mock_pipeline.execute = AsyncMock(return_value=[None, None, 0, None])
    mock_redis = MagicMock()
    mock_redis.pipeline = MagicMock(return_value=mock_pipeline)
    app.state.redis = mock_redis
    yield mock_redis


@pytest_asyncio.fixture(autouse=True)
async def mock_storage_service():
    with (
        patch("app.services.storage.upload_file", new_callable=AsyncMock),
        patch("app.services.storage.delete_file", new_callable=AsyncMock),
        patch(
            "app.services.storage.download_file",
            new_callable=AsyncMock,
            return_value=b"",
        ),
    ):
        yield


@pytest_asyncio.fixture(autouse=True)
async def mock_dispatch_task():
    mock = AsyncMock()
    with (
        patch("app.workers.celery_app.dispatch_task", mock),
        patch("app.api.files.dispatch_task", mock),
        patch("app.api.quiz.dispatch_task", mock),
        patch("app.api.retry.dispatch_task", mock),
        patch("app.api.admin.dispatch_task", mock),
    ):
        yield mock


@pytest.fixture
def mock_ai_generation():
    with patch(
        "app.utils.ai_client.call_ai_with_fallback", new_callable=AsyncMock
    ) as mock:
        mock.return_value = MOCK_GENERATION_RESULT
        yield mock


@pytest.fixture
def mock_ai_grading_correct():
    with patch(
        "app.utils.ai_client.call_ai_with_fallback", new_callable=AsyncMock
    ) as mock:
        mock.return_value = MOCK_GRADING_RESULT
        yield mock


@pytest.fixture
def mock_ai_grading_incorrect():
    with patch(
        "app.utils.ai_client.call_ai_with_fallback", new_callable=AsyncMock
    ) as mock:
        mock.return_value = MOCK_GRADING_INCORRECT_RESULT
        yield mock


@pytest.fixture
def mock_ai_grading_partial():
    with patch(
        "app.utils.ai_client.call_ai_with_fallback", new_callable=AsyncMock
    ) as mock:
        mock.return_value = MOCK_GRADING_PARTIAL_RESULT
        yield mock


@pytest.fixture
def mock_ai_objection_upheld():
    with patch(
        "app.utils.ai_client.call_ai_with_fallback", new_callable=AsyncMock
    ) as mock:
        mock.return_value = MOCK_OBJECTION_UPHELD_RESULT
        yield mock


@pytest.fixture
def mock_ai_objection_rejected():
    with patch(
        "app.utils.ai_client.call_ai_with_fallback", new_callable=AsyncMock
    ) as mock:
        mock.return_value = MOCK_OBJECTION_REJECTED_RESULT
        yield mock
