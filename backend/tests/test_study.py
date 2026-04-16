import uuid
from datetime import datetime, timezone
from unittest.mock import patch

import pytest
import pytest_asyncio
from httpx import AsyncClient

from app.models.file import File, FileSourceType, FileStatus, ParsedDocument
from app.models.study import (
    ContentStatus,
    StudyFlashcard,
    StudyFlashcardSet,
    StudyMindmap,
    StudySummary,
)


@pytest.fixture(autouse=True)
def mock_study_dispatch_task():
    # conftest patches app.api.{files,quiz,...}.dispatch_task but not study;
    # patch the local binding directly to prevent real Celery calls.
    with patch("app.api.study.dispatch_task") as mock:
        yield mock


@pytest_asyncio.fixture
async def parsed_document(db_session, ready_file):
    doc = ParsedDocument(
        id=str(uuid.uuid4()),
        file_id=ready_file.id,
        raw_text="Sample study content for testing.",
        normalized_text="sample study content for testing.",
        language="en",
        page_count=2,
        parser_name="raw",
    )
    db_session.add(doc)
    await db_session.commit()
    await db_session.refresh(doc)
    return doc


@pytest_asyncio.fixture
async def other_user_file(db_session):
    from app.models.user import User, UserRole
    from app.middleware.auth import hash_password

    other = User(
        id=str(uuid.uuid4()),
        username=f"other_{uuid.uuid4().hex[:8]}",
        email=f"other_{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password("OtherPass123!"),
        role=UserRole.user,
        is_active=True,
        email_verified=True,
    )
    db_session.add(other)
    await db_session.flush()

    file = File(
        id=str(uuid.uuid4()),
        user_id=other.id,
        original_filename="other.pdf",
        file_type="pdf",
        file_size_bytes=512,
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
async def pdf_file_with_path(db_session, test_user):
    file = File(
        id=str(uuid.uuid4()),
        user_id=test_user.id,
        original_filename="lecture.pdf",
        stored_path="test_user/lecture.pdf",
        file_type="pdf",
        file_size_bytes=2048,
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
async def completed_summary(db_session, ready_file):
    summary = StudySummary(
        id=str(uuid.uuid4()),
        file_id=ready_file.id,
        content="A comprehensive summary of the uploaded document.",
        status=ContentStatus.completed,
        generated_at=datetime.now(timezone.utc),
    )
    db_session.add(summary)
    await db_session.commit()
    await db_session.refresh(summary)
    return summary


@pytest_asyncio.fixture
async def generating_summary(db_session, ready_file):
    summary = StudySummary(
        id=str(uuid.uuid4()),
        file_id=ready_file.id,
        content=None,
        status=ContentStatus.generating,
    )
    db_session.add(summary)
    await db_session.commit()
    await db_session.refresh(summary)
    return summary


@pytest_asyncio.fixture
async def completed_flashcard_set(db_session, ready_file):
    fset = StudyFlashcardSet(
        id=str(uuid.uuid4()),
        file_id=ready_file.id,
        status=ContentStatus.completed,
        generated_at=datetime.now(timezone.utc),
    )
    db_session.add(fset)
    await db_session.flush()

    for i, (front, back) in enumerate(
        [
            ("What is photosynthesis?", "Process by which plants make food."),
            ("What is mitosis?", "Cell division producing identical daughter cells."),
        ],
        start=1,
    ):
        db_session.add(
            StudyFlashcard(
                id=str(uuid.uuid4()),
                flashcard_set_id=fset.id,
                front=front,
                back=back,
                order=i,
            )
        )

    await db_session.commit()
    await db_session.refresh(fset)
    return fset


@pytest_asyncio.fixture
async def generating_flashcard_set(db_session, ready_file):
    fset = StudyFlashcardSet(
        id=str(uuid.uuid4()),
        file_id=ready_file.id,
        status=ContentStatus.generating,
    )
    db_session.add(fset)
    await db_session.commit()
    await db_session.refresh(fset)
    return fset


@pytest_asyncio.fixture
async def completed_mindmap(db_session, ready_file):
    mindmap = StudyMindmap(
        id=str(uuid.uuid4()),
        file_id=ready_file.id,
        data={
            "nodes": [
                {
                    "id": "root",
                    "label": "Main Topic",
                    "type": "root",
                    "position": {"x": 0, "y": 0},
                },
                {
                    "id": "n1",
                    "label": "Subtopic A",
                    "type": "leaf",
                    "position": {"x": 200, "y": -100},
                },
            ],
            "edges": [
                {"id": "e1", "source": "root", "target": "n1"},
            ],
        },
        status=ContentStatus.completed,
        generated_at=datetime.now(timezone.utc),
    )
    db_session.add(mindmap)
    await db_session.commit()
    await db_session.refresh(mindmap)
    return mindmap


@pytest_asyncio.fixture
async def generating_mindmap(db_session, ready_file):
    mindmap = StudyMindmap(
        id=str(uuid.uuid4()),
        file_id=ready_file.id,
        status=ContentStatus.generating,
    )
    db_session.add(mindmap)
    await db_session.commit()
    await db_session.refresh(mindmap)
    return mindmap


class TestGetStudyStatus:
    async def test_200_all_not_generated(
        self, auth_client: AsyncClient, ready_file: File
    ):
        resp = await auth_client.get(f"/study/{ready_file.id}/status")
        assert resp.status_code == 200
        data = resp.json()
        assert data["file_id"] == ready_file.id
        assert data["summary_status"] == "not_generated"
        assert data["flashcards_status"] == "not_generated"
        assert data["mindmap_status"] == "not_generated"

    async def test_200_reflects_existing_content_statuses(
        self,
        auth_client: AsyncClient,
        ready_file: File,
        completed_summary: StudySummary,
        completed_flashcard_set: StudyFlashcardSet,
        generating_mindmap: StudyMindmap,
    ):
        resp = await auth_client.get(f"/study/{ready_file.id}/status")
        assert resp.status_code == 200
        data = resp.json()
        assert data["summary_status"] == "completed"
        assert data["flashcards_status"] == "completed"
        assert data["mindmap_status"] == "generating"

    async def test_401_unauthenticated(self, client: AsyncClient, ready_file: File):
        resp = await client.get(f"/study/{ready_file.id}/status")
        assert resp.status_code == 401

    async def test_403_other_users_file(
        self, auth_client: AsyncClient, other_user_file: File
    ):
        resp = await auth_client.get(f"/study/{other_user_file.id}/status")
        assert resp.status_code == 403

    async def test_404_nonexistent_file(self, auth_client: AsyncClient):
        resp = await auth_client.get(f"/study/{uuid.uuid4()}/status")
        assert resp.status_code == 404


class TestGenerateSummary:
    async def test_200_dispatches_task(
        self,
        auth_client: AsyncClient,
        ready_file: File,
        mock_study_dispatch_task,
    ):
        resp = await auth_client.post(
            f"/study/{ready_file.id}/summary/generate",
            json={"force_regenerate": False},
        )
        assert resp.status_code == 200
        assert resp.json() == {"status": "dispatched"}
        mock_study_dispatch_task.assert_called_once_with(
            "generate_study_summary", [ready_file.id]
        )

    async def test_409_already_generating(
        self,
        auth_client: AsyncClient,
        ready_file: File,
        generating_summary: StudySummary,
    ):
        resp = await auth_client.post(
            f"/study/{ready_file.id}/summary/generate",
            json={"force_regenerate": False},
        )
        assert resp.status_code == 409
        assert "already in progress" in resp.json()["detail"].lower()

    async def test_400_file_not_ready(
        self, auth_client: AsyncClient, db_session, test_user
    ):
        processing_file = File(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            original_filename="processing.pdf",
            file_type="pdf",
            file_size_bytes=1024,
            source_type=FileSourceType.upload,
            status=FileStatus.parsing,
            is_searchable=False,
            is_quiz_eligible=False,
        )
        db_session.add(processing_file)
        await db_session.commit()

        resp = await auth_client.post(
            f"/study/{processing_file.id}/summary/generate",
            json={"force_regenerate": False},
        )
        assert resp.status_code == 400
        assert "not ready" in resp.json()["detail"].lower()

    async def test_401_unauthenticated(self, client: AsyncClient, ready_file: File):
        resp = await client.post(
            f"/study/{ready_file.id}/summary/generate",
            json={"force_regenerate": False},
        )
        assert resp.status_code == 401

    async def test_404_nonexistent_file(self, auth_client: AsyncClient):
        resp = await auth_client.post(
            f"/study/{uuid.uuid4()}/summary/generate",
            json={"force_regenerate": False},
        )
        assert resp.status_code == 404


class TestGetSummary:
    async def test_200_completed_summary(
        self,
        auth_client: AsyncClient,
        ready_file: File,
        completed_summary: StudySummary,
    ):
        resp = await auth_client.get(f"/study/{ready_file.id}/summary")
        assert resp.status_code == 200
        data = resp.json()
        assert data["file_id"] == ready_file.id
        assert data["status"] == "completed"
        assert data["content"] == completed_summary.content

    async def test_404_not_generated(self, auth_client: AsyncClient, ready_file: File):
        resp = await auth_client.get(f"/study/{ready_file.id}/summary")
        assert resp.status_code == 404
        assert "not available" in resp.json()["detail"].lower()

    async def test_404_still_generating(
        self,
        auth_client: AsyncClient,
        ready_file: File,
        generating_summary: StudySummary,
    ):
        resp = await auth_client.get(f"/study/{ready_file.id}/summary")
        assert resp.status_code == 404

    async def test_401_unauthenticated(self, client: AsyncClient, ready_file: File):
        resp = await client.get(f"/study/{ready_file.id}/summary")
        assert resp.status_code == 401

    async def test_403_other_users_file(
        self, auth_client: AsyncClient, other_user_file: File
    ):
        resp = await auth_client.get(f"/study/{other_user_file.id}/summary")
        assert resp.status_code == 403

    async def test_404_nonexistent_file(self, auth_client: AsyncClient):
        resp = await auth_client.get(f"/study/{uuid.uuid4()}/summary")
        assert resp.status_code == 404


class TestGenerateFlashcards:
    async def test_200_dispatches_task(
        self,
        auth_client: AsyncClient,
        ready_file: File,
        mock_study_dispatch_task,
    ):
        resp = await auth_client.post(
            f"/study/{ready_file.id}/flashcards/generate",
            json={"force_regenerate": False},
        )
        assert resp.status_code == 200
        assert resp.json() == {"status": "dispatched"}
        mock_study_dispatch_task.assert_called_once_with(
            "generate_study_flashcards", [ready_file.id]
        )

    async def test_409_already_generating(
        self,
        auth_client: AsyncClient,
        ready_file: File,
        generating_flashcard_set: StudyFlashcardSet,
    ):
        resp = await auth_client.post(
            f"/study/{ready_file.id}/flashcards/generate",
            json={"force_regenerate": False},
        )
        assert resp.status_code == 409
        assert "already in progress" in resp.json()["detail"].lower()

    async def test_400_file_not_ready(
        self, auth_client: AsyncClient, db_session, test_user
    ):
        file = File(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            original_filename="uploading.pdf",
            file_type="pdf",
            file_size_bytes=512,
            source_type=FileSourceType.upload,
            status=FileStatus.uploaded,
            is_searchable=False,
            is_quiz_eligible=False,
        )
        db_session.add(file)
        await db_session.commit()

        resp = await auth_client.post(
            f"/study/{file.id}/flashcards/generate",
            json={"force_regenerate": False},
        )
        assert resp.status_code == 400

    async def test_200_force_regenerate_soft_deletes_existing(
        self,
        auth_client: AsyncClient,
        ready_file: File,
        completed_flashcard_set: StudyFlashcardSet,
        db_session,
    ):
        resp = await auth_client.post(
            f"/study/{ready_file.id}/flashcards/generate",
            json={"force_regenerate": True},
        )
        assert resp.status_code == 200
        await db_session.refresh(completed_flashcard_set)
        assert completed_flashcard_set.deleted_at is not None

    async def test_401_unauthenticated(self, client: AsyncClient, ready_file: File):
        resp = await client.post(
            f"/study/{ready_file.id}/flashcards/generate",
            json={"force_regenerate": False},
        )
        assert resp.status_code == 401


class TestGetFlashcards:
    async def test_200_returns_card_list(
        self,
        auth_client: AsyncClient,
        ready_file: File,
        completed_flashcard_set: StudyFlashcardSet,
    ):
        resp = await auth_client.get(f"/study/{ready_file.id}/flashcards")
        assert resp.status_code == 200
        data = resp.json()
        assert data["file_id"] == ready_file.id
        assert data["status"] == "completed"
        cards = data["cards"]
        assert len(cards) == 2
        assert cards[0]["order"] == 1
        assert "front" in cards[0]
        assert "back" in cards[0]

    async def test_404_not_generated(self, auth_client: AsyncClient, ready_file: File):
        resp = await auth_client.get(f"/study/{ready_file.id}/flashcards")
        assert resp.status_code == 404

    async def test_404_still_generating(
        self,
        auth_client: AsyncClient,
        ready_file: File,
        generating_flashcard_set: StudyFlashcardSet,
    ):
        resp = await auth_client.get(f"/study/{ready_file.id}/flashcards")
        assert resp.status_code == 404

    async def test_401_unauthenticated(self, client: AsyncClient, ready_file: File):
        resp = await client.get(f"/study/{ready_file.id}/flashcards")
        assert resp.status_code == 401

    async def test_403_other_users_file(
        self, auth_client: AsyncClient, other_user_file: File
    ):
        resp = await auth_client.get(f"/study/{other_user_file.id}/flashcards")
        assert resp.status_code == 403


class TestGenerateMindmap:
    async def test_200_dispatches_task(
        self,
        auth_client: AsyncClient,
        ready_file: File,
        mock_study_dispatch_task,
    ):
        resp = await auth_client.post(
            f"/study/{ready_file.id}/mindmap/generate",
            json={"force_regenerate": False},
        )
        assert resp.status_code == 200
        assert resp.json() == {"status": "dispatched"}
        mock_study_dispatch_task.assert_called_once_with(
            "generate_study_mindmap", [ready_file.id]
        )

    async def test_409_already_generating(
        self,
        auth_client: AsyncClient,
        ready_file: File,
        generating_mindmap: StudyMindmap,
    ):
        resp = await auth_client.post(
            f"/study/{ready_file.id}/mindmap/generate",
            json={"force_regenerate": False},
        )
        assert resp.status_code == 409
        assert "already in progress" in resp.json()["detail"].lower()

    async def test_400_file_not_ready(
        self, auth_client: AsyncClient, db_session, test_user
    ):
        file = File(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            original_filename="failed.pdf",
            file_type="pdf",
            file_size_bytes=512,
            source_type=FileSourceType.upload,
            status=FileStatus.failed_partial,
            is_searchable=False,
            is_quiz_eligible=False,
        )
        db_session.add(file)
        await db_session.commit()

        resp = await auth_client.post(
            f"/study/{file.id}/mindmap/generate",
            json={"force_regenerate": False},
        )
        assert resp.status_code == 400

    async def test_200_force_regenerate_soft_deletes_existing(
        self,
        auth_client: AsyncClient,
        ready_file: File,
        completed_mindmap: StudyMindmap,
        db_session,
    ):
        resp = await auth_client.post(
            f"/study/{ready_file.id}/mindmap/generate",
            json={"force_regenerate": True},
        )
        assert resp.status_code == 200
        await db_session.refresh(completed_mindmap)
        assert completed_mindmap.deleted_at is not None

    async def test_401_unauthenticated(self, client: AsyncClient, ready_file: File):
        resp = await client.post(
            f"/study/{ready_file.id}/mindmap/generate",
            json={"force_regenerate": False},
        )
        assert resp.status_code == 401

    async def test_404_nonexistent_file(self, auth_client: AsyncClient):
        resp = await auth_client.post(
            f"/study/{uuid.uuid4()}/mindmap/generate",
            json={"force_regenerate": False},
        )
        assert resp.status_code == 404


class TestGetMindmap:
    async def test_200_returns_nodes_and_edges(
        self,
        auth_client: AsyncClient,
        ready_file: File,
        completed_mindmap: StudyMindmap,
    ):
        resp = await auth_client.get(f"/study/{ready_file.id}/mindmap")
        assert resp.status_code == 200
        data = resp.json()
        assert data["file_id"] == ready_file.id
        assert data["status"] == "completed"
        assert "nodes" in data["data"]
        assert "edges" in data["data"]
        assert len(data["data"]["nodes"]) == 2

    async def test_404_not_generated(self, auth_client: AsyncClient, ready_file: File):
        resp = await auth_client.get(f"/study/{ready_file.id}/mindmap")
        assert resp.status_code == 404

    async def test_404_still_generating(
        self,
        auth_client: AsyncClient,
        ready_file: File,
        generating_mindmap: StudyMindmap,
    ):
        resp = await auth_client.get(f"/study/{ready_file.id}/mindmap")
        assert resp.status_code == 404

    async def test_401_unauthenticated(self, client: AsyncClient, ready_file: File):
        resp = await client.get(f"/study/{ready_file.id}/mindmap")
        assert resp.status_code == 401

    async def test_403_other_users_file(
        self, auth_client: AsyncClient, other_user_file: File
    ):
        resp = await auth_client.get(f"/study/{other_user_file.id}/mindmap")
        assert resp.status_code == 403

    async def test_404_nonexistent_file(self, auth_client: AsyncClient):
        resp = await auth_client.get(f"/study/{uuid.uuid4()}/mindmap")
        assert resp.status_code == 404


class TestViewFile:
    async def test_200_inline_pdf_content_disposition(
        self,
        auth_client: AsyncClient,
        pdf_file_with_path: File,
    ):
        resp = await auth_client.get(f"/files/{pdf_file_with_path.id}/view")
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("application/pdf")
        cd = resp.headers["content-disposition"]
        assert cd.startswith("inline")

    async def test_200_filename_in_content_disposition(
        self,
        auth_client: AsyncClient,
        pdf_file_with_path: File,
    ):
        resp = await auth_client.get(f"/files/{pdf_file_with_path.id}/view")
        assert resp.status_code == 200
        cd = resp.headers["content-disposition"]
        assert "lecture.pdf" in cd

    async def test_401_unauthenticated(
        self, client: AsyncClient, pdf_file_with_path: File
    ):
        resp = await client.get(f"/files/{pdf_file_with_path.id}/view")
        assert resp.status_code == 401

    async def test_403_other_users_file(
        self, auth_client: AsyncClient, other_user_file: File
    ):
        # other_user_file has no stored_path but ownership check fires first
        resp = await auth_client.get(f"/files/{other_user_file.id}/view")
        assert resp.status_code == 403

    async def test_404_nonexistent_file(self, auth_client: AsyncClient):
        resp = await auth_client.get(f"/files/{uuid.uuid4()}/view")
        assert resp.status_code == 404

    async def test_404_no_stored_path(self, auth_client: AsyncClient, ready_file: File):
        resp = await auth_client.get(f"/files/{ready_file.id}/view")
        assert resp.status_code == 404
