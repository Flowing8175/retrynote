import uuid
from httpx import AsyncClient

from app.models.file import File, FileSourceType, FileStatus, Folder
from app.models.quiz import (
    QuizSession,
    QuizSessionStatus,
    QuizMode,
    SourceMode,
    QuizItem,
    QuestionType,
    AnswerLog,
    Judgement,
)


class TestSearch:
    async def test_search_files_scope(
        self, auth_client: AsyncClient, db_session, test_user
    ):
        file1 = File(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            original_filename="mathematics_notes.pdf",
            file_type="pdf",
            file_size_bytes=1024,
            source_type=FileSourceType.upload,
            status=FileStatus.ready,
        )
        file2 = File(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            original_filename="physics_document.pdf",
            file_type="pdf",
            file_size_bytes=2048,
            source_type=FileSourceType.upload,
            status=FileStatus.ready,
        )
        db_session.add_all([file1, file2])
        await db_session.commit()

        resp = await auth_client.get(
            "/search", params={"q": "mathematics", "scope": "files"}
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        assert any("mathematics" in r["title"].lower() for r in data["results"])
        assert all(r["result_type"] == "file" for r in data["results"])

    async def test_search_wrong_notes_scope(
        self, auth_client: AsyncClient, db_session, test_user
    ):
        session = QuizSession(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            mode=QuizMode.normal,
            source_mode=SourceMode.document_based,
            status=QuizSessionStatus.graded,
            question_count=1,
        )
        db_session.add(session)
        await db_session.flush()

        item = QuizItem(
            id=str(uuid.uuid4()),
            quiz_session_id=session.id,
            item_order=1,
            question_type=QuestionType.multiple_choice,
            question_text="What is the capital of France?",
            correct_answer_json={"answer": "A"},
            explanation_text="Paris is the capital of France.",
            concept_key="geography_france",
            concept_label="Geography - France",
        )
        db_session.add(item)
        await db_session.flush()

        answer_log = AnswerLog(
            id=str(uuid.uuid4()),
            quiz_session_id=session.id,
            quiz_item_id=item.id,
            user_id=test_user.id,
            user_answer_raw="B",
            judgement=Judgement.incorrect,
            score_awarded=0.0,
            max_score=1.0,
            is_active_result=True,
        )
        db_session.add(answer_log)
        await db_session.commit()

        resp = await auth_client.get(
            "/search", params={"q": "France", "scope": "wrong_notes"}
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        assert all(r["result_type"] == "wrong_note" for r in data["results"])

    async def test_search_quiz_history_scope(
        self, auth_client: AsyncClient, db_session, test_user
    ):
        # Quiz history search now filters by item text — sessions need matching items.
        session1 = QuizSession(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            mode=QuizMode.normal,
            source_mode=SourceMode.document_based,
            status=QuizSessionStatus.graded,
            question_count=1,
        )
        session2 = QuizSession(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            mode=QuizMode.exam,
            source_mode=SourceMode.no_source,
            status=QuizSessionStatus.graded,
            question_count=1,
        )
        db_session.add_all([session1, session2])
        await db_session.flush()

        item1 = QuizItem(
            id=str(uuid.uuid4()),
            quiz_session_id=session1.id,
            item_order=1,
            question_type=QuestionType.multiple_choice,
            question_text="What is photosynthesis?",
            correct_answer_json={"answer": "A"},
            concept_key="photosynthesis",
            concept_label="Photosynthesis",
        )
        item2 = QuizItem(
            id=str(uuid.uuid4()),
            quiz_session_id=session2.id,
            item_order=1,
            question_type=QuestionType.multiple_choice,
            question_text="Describe photosynthesis in plants.",
            correct_answer_json={"answer": "B"},
            concept_key="photosynthesis_plants",
            concept_label="Photosynthesis in Plants",
        )
        db_session.add_all([item1, item2])
        await db_session.commit()

        resp = await auth_client.get(
            "/search", params={"q": "photosynthesis", "scope": "quiz_history"}
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 2
        assert all(r["result_type"] == "quiz_session" for r in data["results"])

    async def test_search_all_scope(
        self, auth_client: AsyncClient, db_session, test_user
    ):
        file = File(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            original_filename="chemistry_basics.pdf",
            file_type="pdf",
            file_size_bytes=1024,
            source_type=FileSourceType.upload,
            status=FileStatus.ready,
        )
        db_session.add(file)

        session = QuizSession(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            mode=QuizMode.normal,
            source_mode=SourceMode.document_based,
            status=QuizSessionStatus.graded,
            question_count=3,
        )
        db_session.add(session)
        await db_session.commit()

        resp = await auth_client.get(
            "/search", params={"q": "chemistry", "scope": "all"}
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        result_types = {r["result_type"] for r in data["results"]}
        assert "file" in result_types

    async def test_search_no_results(self, auth_client: AsyncClient):
        resp = await auth_client.get(
            "/search", params={"q": "nonexistent_xyz_12345", "scope": "all"}
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["results"] == []

    async def test_search_with_file_id_filter(
        self, auth_client: AsyncClient, db_session, test_user
    ):
        file1 = File(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            original_filename="biology_notes.pdf",
            file_type="pdf",
            file_size_bytes=1024,
            source_type=FileSourceType.upload,
            status=FileStatus.ready,
        )
        file2 = File(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            original_filename="history_notes.pdf",
            file_type="pdf",
            file_size_bytes=1024,
            source_type=FileSourceType.upload,
            status=FileStatus.ready,
        )
        db_session.add_all([file1, file2])
        await db_session.commit()

        resp = await auth_client.get(
            "/search",
            params={"q": "notes", "scope": "wrong_notes", "file_id": file1.id},
        )
        assert resp.status_code == 200

    async def test_search_with_folder_id_filter(
        self, auth_client: AsyncClient, db_session, test_user
    ):
        folder = Folder(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            name="Science Folder",
        )
        db_session.add(folder)
        await db_session.flush()

        file_in_folder = File(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            original_filename="science_101.pdf",
            file_type="pdf",
            file_size_bytes=1024,
            source_type=FileSourceType.upload,
            status=FileStatus.ready,
            folder_id=folder.id,
        )
        file_outside = File(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            original_filename="science_202.pdf",
            file_type="pdf",
            file_size_bytes=1024,
            source_type=FileSourceType.upload,
            status=FileStatus.ready,
            folder_id=None,
        )
        db_session.add_all([file_in_folder, file_outside])
        await db_session.commit()

        resp = await auth_client.get(
            "/search",
            params={"q": "science", "scope": "files", "folder_id": folder.id},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        assert all(r["source_id"] == file_in_folder.id for r in data["results"])

    async def test_search_pagination(
        self, auth_client: AsyncClient, db_session, test_user
    ):
        for i in range(5):
            file = File(
                id=str(uuid.uuid4()),
                user_id=test_user.id,
                original_filename=f"document_{i}.pdf",
                file_type="pdf",
                file_size_bytes=1024,
                source_type=FileSourceType.upload,
                status=FileStatus.ready,
            )
            db_session.add(file)
        await db_session.commit()

        resp = await auth_client.get(
            "/search", params={"q": "document", "scope": "files", "page": 1, "size": 1}
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["results"]) == 1
        assert data["page"] == 1
        assert data["size"] == 1

        resp2 = await auth_client.get(
            "/search", params={"q": "document", "scope": "files", "page": 2, "size": 1}
        )
        assert resp2.status_code == 200
        data2 = resp2.json()
        assert len(data2["results"]) == 1
        assert data2["page"] == 2

    async def test_search_requires_auth(self, client: AsyncClient):
        resp = await client.get("/search", params={"q": "test", "scope": "all"})
        assert resp.status_code == 401

    async def test_search_deleted_files_excluded(
        self, auth_client: AsyncClient, db_session, test_user
    ):
        from datetime import datetime, timezone

        file_active = File(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            original_filename="active_document.pdf",
            file_type="pdf",
            file_size_bytes=1024,
            source_type=FileSourceType.upload,
            status=FileStatus.ready,
        )
        file_deleted = File(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            original_filename="deleted_document.pdf",
            file_type="pdf",
            file_size_bytes=1024,
            source_type=FileSourceType.upload,
            status=FileStatus.deleted,
            deleted_at=datetime.now(timezone.utc),
        )
        db_session.add_all([file_active, file_deleted])
        await db_session.commit()

        resp = await auth_client.get(
            "/search", params={"q": "document", "scope": "files"}
        )
        assert resp.status_code == 200
        data = resp.json()
        assert all(r["source_id"] != file_deleted.id for r in data["results"])
        assert any(r["source_id"] == file_active.id for r in data["results"])

    async def test_search_response_structure(
        self, auth_client: AsyncClient, db_session, test_user
    ):
        file = File(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            original_filename="test_structure.pdf",
            file_type="pdf",
            file_size_bytes=1024,
            source_type=FileSourceType.upload,
            status=FileStatus.ready,
        )
        db_session.add(file)
        await db_session.commit()

        resp = await auth_client.get(
            "/search", params={"q": "structure", "scope": "files"}
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1

        result = data["results"][0]
        assert "result_type" in result
        assert "title" in result
        assert "snippet" in result
        assert "source_id" in result
        assert "source_metadata" in result
        assert result["result_type"] == "file"
        assert result["source_id"] == file.id
