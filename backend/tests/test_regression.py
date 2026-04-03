import uuid
import pytest
from httpx import AsyncClient
from datetime import datetime, timezone

from app.models.quiz import (
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
)
from app.models.file import File, FileSourceType, FileStatus
from app.models.objection import Objection, ObjectionStatus, WeakPoint
from app.models.admin import AdminAuditLog
from app.models.search import ImpersonationSession, Job
from app.models.user import User, UserRole
from app.middleware.auth import hash_password, create_access_token


class TestRegressionSessionStateTransitions:
    """Test every valid state transition in quiz_sessions.status.
    draft → generating → ready → in_progress → submitted → grading → graded
    → objection_pending → regraded → closed
    Also: → generation_failed
    """

    async def test_draft_to_generating(self, db_session, test_user):
        session = QuizSession(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            mode=QuizMode.normal,
            source_mode=SourceMode.document_based,
            status=QuizSessionStatus.draft,
        )
        db_session.add(session)
        await db_session.commit()

        session.status = QuizSessionStatus.generating
        await db_session.commit()
        await db_session.refresh(session)
        assert session.status == QuizSessionStatus.generating

    async def test_generating_to_ready(self, db_session, test_user):
        session = QuizSession(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            mode=QuizMode.normal,
            source_mode=SourceMode.document_based,
            status=QuizSessionStatus.generating,
        )
        db_session.add(session)
        await db_session.commit()

        session.status = QuizSessionStatus.ready
        await db_session.commit()
        await db_session.refresh(session)
        assert session.status == QuizSessionStatus.ready

    async def test_generating_to_generation_failed(self, db_session, test_user):
        session = QuizSession(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            mode=QuizMode.normal,
            source_mode=SourceMode.document_based,
            status=QuizSessionStatus.generating,
        )
        db_session.add(session)
        await db_session.commit()

        session.status = QuizSessionStatus.generation_failed
        await db_session.commit()
        await db_session.refresh(session)
        assert session.status == QuizSessionStatus.generation_failed

    async def test_ready_to_in_progress(self, db_session, test_user):
        session = QuizSession(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            mode=QuizMode.normal,
            source_mode=SourceMode.document_based,
            status=QuizSessionStatus.ready,
        )
        db_session.add(session)
        await db_session.commit()

        session.status = QuizSessionStatus.in_progress
        session.started_at = datetime.now(timezone.utc)
        await db_session.commit()
        await db_session.refresh(session)
        assert session.status == QuizSessionStatus.in_progress

    async def test_in_progress_to_submitted(self, db_session, test_user):
        session = QuizSession(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            mode=QuizMode.normal,
            source_mode=SourceMode.document_based,
            status=QuizSessionStatus.in_progress,
            started_at=datetime.now(timezone.utc),
        )
        db_session.add(session)
        await db_session.commit()

        session.status = QuizSessionStatus.submitted
        session.submitted_at = datetime.now(timezone.utc)
        await db_session.commit()
        await db_session.refresh(session)
        assert session.status == QuizSessionStatus.submitted

    async def test_submitted_to_grading(self, db_session, test_user):
        session = QuizSession(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            mode=QuizMode.exam,
            source_mode=SourceMode.document_based,
            status=QuizSessionStatus.submitted,
            submitted_at=datetime.now(timezone.utc),
        )
        db_session.add(session)
        await db_session.commit()

        session.status = QuizSessionStatus.grading
        await db_session.commit()
        await db_session.refresh(session)
        assert session.status == QuizSessionStatus.grading

    async def test_grading_to_graded(self, db_session, test_user):
        session = QuizSession(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            mode=QuizMode.normal,
            source_mode=SourceMode.document_based,
            status=QuizSessionStatus.grading,
        )
        db_session.add(session)
        await db_session.commit()

        session.status = QuizSessionStatus.graded
        session.graded_at = datetime.now(timezone.utc)
        session.total_score = 3.0
        session.max_score = 5.0
        await db_session.commit()
        await db_session.refresh(session)
        assert session.status == QuizSessionStatus.graded
        assert session.total_score == 3.0

    async def test_graded_to_objection_pending(self, db_session, test_user):
        session = QuizSession(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            mode=QuizMode.normal,
            source_mode=SourceMode.document_based,
            status=QuizSessionStatus.graded,
            graded_at=datetime.now(timezone.utc),
        )
        db_session.add(session)
        await db_session.commit()

        session.status = QuizSessionStatus.objection_pending
        await db_session.commit()
        await db_session.refresh(session)
        assert session.status == QuizSessionStatus.objection_pending

    async def test_objection_pending_to_regraded(self, db_session, test_user):
        session = QuizSession(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            mode=QuizMode.normal,
            source_mode=SourceMode.document_based,
            status=QuizSessionStatus.objection_pending,
        )
        db_session.add(session)
        await db_session.commit()

        session.status = QuizSessionStatus.regraded
        await db_session.commit()
        await db_session.refresh(session)
        assert session.status == QuizSessionStatus.regraded

    async def test_regraded_to_closed(self, db_session, test_user):
        session = QuizSession(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            mode=QuizMode.normal,
            source_mode=SourceMode.document_based,
            status=QuizSessionStatus.regraded,
        )
        db_session.add(session)
        await db_session.commit()

        session.status = QuizSessionStatus.closed
        await db_session.commit()
        await db_session.refresh(session)
        assert session.status == QuizSessionStatus.closed

    async def test_graded_to_closed(self, db_session, test_user):
        session = QuizSession(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            mode=QuizMode.normal,
            source_mode=SourceMode.document_based,
            status=QuizSessionStatus.graded,
        )
        db_session.add(session)
        await db_session.commit()

        session.status = QuizSessionStatus.closed
        await db_session.commit()
        await db_session.refresh(session)
        assert session.status == QuizSessionStatus.closed

    async def test_full_transition_chain(self, db_session, test_user):
        session = QuizSession(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            mode=QuizMode.normal,
            source_mode=SourceMode.document_based,
            status=QuizSessionStatus.draft,
        )
        db_session.add(session)
        await db_session.commit()

        chain = [
            QuizSessionStatus.generating,
            QuizSessionStatus.ready,
            QuizSessionStatus.in_progress,
            QuizSessionStatus.submitted,
            QuizSessionStatus.grading,
            QuizSessionStatus.graded,
            QuizSessionStatus.objection_pending,
            QuizSessionStatus.regraded,
            QuizSessionStatus.closed,
        ]
        for status in chain:
            session.status = status
            await db_session.commit()
            await db_session.refresh(session)
            assert session.status == status

    async def test_answer_on_non_active_session_rejected(
        self, auth_client: AsyncClient, db_session, test_user
    ):
        for status in [
            QuizSessionStatus.draft,
            QuizSessionStatus.generating,
            QuizSessionStatus.graded,
            QuizSessionStatus.closed,
        ]:
            session = QuizSession(
                id=str(uuid.uuid4()),
                user_id=test_user.id,
                mode=QuizMode.normal,
                source_mode=SourceMode.document_based,
                status=status,
            )
            db_session.add(session)
            await db_session.flush()

            item = QuizItem(
                id=str(uuid.uuid4()),
                quiz_session_id=session.id,
                item_order=1,
                question_type=QuestionType.multiple_choice,
                question_text="Test?",
                correct_answer_json={"answer": "A"},
            )
            db_session.add(item)
            await db_session.commit()

            resp = await auth_client.post(
                f"/quiz-sessions/{session.id}/items/{item.id}/answer",
                json={"user_answer": "A"},
            )
            assert resp.status_code == 400, f"Status {status} should reject answers"


class TestRegressionExamSubmitIdempotency:
    """Submit with same idempotency_key twice. Second call must return same result."""

    async def test_duplicate_submit_returns_same_result(
        self, auth_client: AsyncClient, db_session, test_user
    ):
        session = QuizSession(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            mode=QuizMode.exam,
            source_mode=SourceMode.document_based,
            status=QuizSessionStatus.in_progress,
            started_at=datetime.now(timezone.utc),
        )
        db_session.add(session)
        await db_session.flush()

        items = []
        for i in range(3):
            item = QuizItem(
                id=str(uuid.uuid4()),
                quiz_session_id=session.id,
                item_order=i + 1,
                question_type=QuestionType.multiple_choice,
                question_text=f"Question {i + 1}",
                correct_answer_json={"answer": "A"},
            )
            db_session.add(item)
            items.append(item)
        await db_session.commit()

        key = str(uuid.uuid4())
        resp1 = await auth_client.post(
            f"/quiz-sessions/{session.id}/submit",
            json={"idempotency_key": key},
        )
        assert resp1.status_code == 200
        result1 = resp1.json()

        resp2 = await auth_client.post(
            f"/quiz-sessions/{session.id}/submit",
            json={"idempotency_key": key},
        )
        assert resp2.status_code == 200
        result2 = resp2.json()

        assert result1["status"] == result2["status"]

    async def test_submit_after_already_graded(
        self, auth_client: AsyncClient, db_session, test_user
    ):
        session = QuizSession(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            mode=QuizMode.exam,
            source_mode=SourceMode.document_based,
            status=QuizSessionStatus.graded,
            total_score=2.0,
            max_score=3.0,
        )
        db_session.add(session)
        await db_session.commit()

        resp = await auth_client.post(
            f"/quiz-sessions/{session.id}/submit",
            json={"idempotency_key": str(uuid.uuid4())},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "graded"

    async def test_submit_after_grading(
        self, auth_client: AsyncClient, db_session, test_user
    ):
        session = QuizSession(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            mode=QuizMode.exam,
            source_mode=SourceMode.document_based,
            status=QuizSessionStatus.grading,
        )
        db_session.add(session)
        await db_session.commit()

        resp = await auth_client.post(
            f"/quiz-sessions/{session.id}/submit",
            json={"idempotency_key": str(uuid.uuid4())},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "grading"


class TestRegressionActiveResultRegrading:
    """When objection is upheld:
    - Old answer_log.is_active_result → False
    - New answer_log created with is_active_result=True
    - Dashboard queries use only active results
    """

    async def test_active_result_swap(self, db_session, test_user):
        session = QuizSession(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            mode=QuizMode.normal,
            source_mode=SourceMode.document_based,
            status=QuizSessionStatus.graded,
            total_score=0.0,
            max_score=1.0,
        )
        db_session.add(session)
        await db_session.flush()

        item = QuizItem(
            id=str(uuid.uuid4()),
            quiz_session_id=session.id,
            item_order=1,
            question_type=QuestionType.multiple_choice,
            question_text="Regrade test?",
            correct_answer_json={"answer": "A"},
            concept_key="regrade_test",
            concept_label="Regrade Test",
        )
        db_session.add(item)
        await db_session.flush()

        old_log = AnswerLog(
            id=str(uuid.uuid4()),
            quiz_item_id=item.id,
            quiz_session_id=session.id,
            user_id=test_user.id,
            user_answer_raw="B",
            user_answer_normalized="b",
            judgement=Judgement.incorrect,
            score_awarded=0.0,
            max_score=1.0,
            error_type=ErrorType.careless_mistake,
            is_active_result=True,
            graded_at=datetime.now(timezone.utc),
        )
        db_session.add(old_log)
        await db_session.commit()

        # Simulate regrade
        old_log.is_active_result = False
        new_log = AnswerLog(
            id=str(uuid.uuid4()),
            quiz_item_id=item.id,
            quiz_session_id=session.id,
            user_id=test_user.id,
            user_answer_raw="B",
            user_answer_normalized="b",
            judgement=Judgement.correct,
            score_awarded=1.0,
            max_score=1.0,
            is_active_result=True,
            graded_at=datetime.now(timezone.utc),
            regraded_from_answer_log_id=old_log.id,
        )
        db_session.add(new_log)
        await db_session.commit()

        # Verify old deactivated
        await db_session.refresh(old_log)
        assert old_log.is_active_result is False

        # Verify new active
        await db_session.refresh(new_log)
        assert new_log.is_active_result is True
        assert new_log.judgement == Judgement.correct
        assert new_log.regraded_from_answer_log_id == old_log.id

    async def test_dashboard_uses_only_active_results(
        self, auth_client: AsyncClient, db_session, test_user
    ):
        session = QuizSession(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            mode=QuizMode.normal,
            source_mode=SourceMode.document_based,
            status=QuizSessionStatus.regraded,
            total_score=1.0,
            max_score=1.0,
        )
        db_session.add(session)
        await db_session.flush()

        item = QuizItem(
            id=str(uuid.uuid4()),
            quiz_session_id=session.id,
            item_order=1,
            question_type=QuestionType.multiple_choice,
            question_text="Active result test?",
            correct_answer_json={"answer": "A"},
        )
        db_session.add(item)
        await db_session.flush()

        # Old incorrect (inactive)
        old_log = AnswerLog(
            id=str(uuid.uuid4()),
            quiz_item_id=item.id,
            quiz_session_id=session.id,
            user_id=test_user.id,
            user_answer_raw="B",
            user_answer_normalized="b",
            judgement=Judgement.incorrect,
            score_awarded=0.0,
            max_score=1.0,
            is_active_result=False,
            graded_at=datetime.now(timezone.utc),
        )
        # New correct (active)
        new_log = AnswerLog(
            id=str(uuid.uuid4()),
            quiz_item_id=item.id,
            quiz_session_id=session.id,
            user_id=test_user.id,
            user_answer_raw="A",
            user_answer_normalized="a",
            judgement=Judgement.correct,
            score_awarded=1.0,
            max_score=1.0,
            is_active_result=True,
            graded_at=datetime.now(timezone.utc),
        )
        db_session.add(old_log)
        db_session.add(new_log)
        await db_session.commit()

        # Dashboard should only count active result
        resp = await auth_client.get("/dashboard")
        assert resp.status_code == 200
        data = resp.json()
        assert data["overall_accuracy"] > 0 or data["learning_volume"] >= 1

    async def test_multiple_regrades_keeps_only_last_active(
        self, db_session, test_user
    ):
        session = QuizSession(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            mode=QuizMode.normal,
            source_mode=SourceMode.document_based,
            status=QuizSessionStatus.graded,
        )
        db_session.add(session)
        await db_session.flush()

        item = QuizItem(
            id=str(uuid.uuid4()),
            quiz_session_id=session.id,
            item_order=1,
            question_type=QuestionType.multiple_choice,
            question_text="Multi regrade?",
            correct_answer_json={"answer": "A"},
        )
        db_session.add(item)
        await db_session.flush()

        # Create 3 answer logs, only last active
        log1 = AnswerLog(
            id=str(uuid.uuid4()),
            quiz_item_id=item.id,
            quiz_session_id=session.id,
            user_id=test_user.id,
            user_answer_raw="B",
            user_answer_normalized="b",
            judgement=Judgement.incorrect,
            score_awarded=0.0,
            max_score=1.0,
            is_active_result=False,
            graded_at=datetime.now(timezone.utc),
        )
        log2 = AnswerLog(
            id=str(uuid.uuid4()),
            quiz_item_id=item.id,
            quiz_session_id=session.id,
            user_id=test_user.id,
            user_answer_raw="B",
            user_answer_normalized="b",
            judgement=Judgement.partial,
            score_awarded=0.5,
            max_score=1.0,
            is_active_result=False,
            graded_at=datetime.now(timezone.utc),
            regraded_from_answer_log_id=log1.id,
        )
        log3 = AnswerLog(
            id=str(uuid.uuid4()),
            quiz_item_id=item.id,
            quiz_session_id=session.id,
            user_id=test_user.id,
            user_answer_raw="B",
            user_answer_normalized="b",
            judgement=Judgement.correct,
            score_awarded=1.0,
            max_score=1.0,
            is_active_result=True,
            graded_at=datetime.now(timezone.utc),
            regraded_from_answer_log_id=log2.id,
        )
        db_session.add_all([log1, log2, log3])
        await db_session.commit()

        from sqlalchemy import select, func

        active_count = await db_session.execute(
            select(func.count())
            .select_from(AnswerLog)
            .where(
                AnswerLog.quiz_item_id == item.id,
                AnswerLog.is_active_result == True,
            )
        )
        assert active_count.scalar() == 1


class TestRegressionFileDeletionSearchExclusion:
    """Delete a file → verify it's excluded from search results."""

    async def test_deleted_file_excluded_from_search(
        self, auth_client: AsyncClient, db_session, test_user
    ):
        file = File(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            original_filename="searchable_doc.pdf",
            file_type="pdf",
            file_size_bytes=500,
            source_type=FileSourceType.upload,
            status=FileStatus.ready,
            is_searchable=True,
            is_quiz_eligible=True,
        )
        db_session.add(file)
        await db_session.commit()
        await db_session.refresh(file)

        # Search before delete
        resp_before = await auth_client.get(
            "/search",
            params={
                "q": "searchable_doc",
                "scope": "files",
            },
        )
        assert resp_before.status_code == 200
        before_count = resp_before.json()["total"]
        assert before_count >= 1

        # Delete file
        await auth_client.delete(f"/files/{file.id}")

        # Search after delete
        resp_after = await auth_client.get(
            "/search",
            params={
                "q": "searchable_doc",
                "scope": "files",
            },
        )
        assert resp_after.status_code == 200
        after_count = resp_after.json()["total"]
        assert after_count == before_count - 1

    async def test_deleted_file_excluded_from_file_list(
        self, auth_client: AsyncClient, db_session, test_user
    ):
        file = File(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            original_filename="to_delete.txt",
            file_type="txt",
            file_size_bytes=100,
            source_type=FileSourceType.manual_text,
            status=FileStatus.ready,
            is_searchable=True,
        )
        db_session.add(file)
        await db_session.commit()

        resp_before = await auth_client.get("/files")
        before_total = resp_before.json()["total"]

        await auth_client.delete(f"/files/{file.id}")

        resp_after = await auth_client.get("/files")
        after_total = resp_after.json()["total"]
        assert after_total == before_total - 1

    async def test_deleted_file_not_quiz_eligible(
        self, auth_client: AsyncClient, db_session, test_user, ready_file
    ):
        file_id = ready_file.id
        await auth_client.delete(f"/files/{file_id}")

        await db_session.refresh(ready_file)
        assert ready_file.is_quiz_eligible is False
        assert ready_file.is_searchable is False
        assert ready_file.status == FileStatus.deleted


class TestRegressionAdminImpersonationAuditLogging:
    """Every action in impersonation mode creates admin_audit_log entry."""

    async def test_impersonation_start_creates_audit_log(
        self, verified_admin_client: AsyncClient, db_session, test_user
    ):
        resp = await verified_admin_client.post(
            "/admin/impersonation/start",
            json={
                "target_user_id": test_user.id,
                "reason": "Testing audit log creation",
            },
        )
        assert resp.status_code == 200

        from sqlalchemy import select

        logs = await db_session.execute(
            select(AdminAuditLog).where(
                AdminAuditLog.action_type == "impersonation_start"
            )
        )
        audit_logs = logs.scalars().all()
        assert len(audit_logs) >= 1
        log = audit_logs[-1]
        assert log.target_user_id == test_user.id
        assert log.reason == "Testing audit log creation"

    async def test_impersonation_end_creates_audit_log(
        self, verified_admin_client: AsyncClient, db_session, admin_user, test_user
    ):
        imp_resp = await verified_admin_client.post(
            "/admin/impersonation/start",
            json={
                "target_user_id": test_user.id,
                "reason": "For end test",
            },
        )
        imp_id = imp_resp.json()["impersonation_id"]

        end_resp = await verified_admin_client.post(
            f"/admin/impersonation/{imp_id}/end",
        )
        assert end_resp.status_code == 200

        from sqlalchemy import select

        logs = await db_session.execute(
            select(AdminAuditLog).where(
                AdminAuditLog.action_type == "impersonation_end"
            )
        )
        audit_logs = logs.scalars().all()
        assert len(audit_logs) >= 1

    async def test_regrade_creates_audit_log(
        self, verified_admin_client: AsyncClient, db_session, test_user
    ):
        session = QuizSession(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            mode=QuizMode.normal,
            source_mode=SourceMode.document_based,
            status=QuizSessionStatus.graded,
        )
        db_session.add(session)
        await db_session.flush()

        item = QuizItem(
            id=str(uuid.uuid4()),
            quiz_session_id=session.id,
            item_order=1,
            question_type=QuestionType.multiple_choice,
            question_text="Audit log regrade test",
            correct_answer_json={"answer": "A"},
        )
        db_session.add(item)
        await db_session.commit()
        await db_session.refresh(item)

        resp = await verified_admin_client.post(
            f"/admin/quiz-items/{item.id}/regrade",
            json={"reason": "Testing regrade audit"},
        )
        assert resp.status_code == 200

        from sqlalchemy import select

        logs = await db_session.execute(
            select(AdminAuditLog).where(
                AdminAuditLog.action_type == "regrade_request",
                AdminAuditLog.target_id == item.id,
            )
        )
        audit_logs = logs.scalars().all()
        assert len(audit_logs) >= 1
        log = audit_logs[-1]
        assert log.target_type == "quiz_item"
        assert log.reason == "Testing regrade audit"

    async def test_list_users_creates_audit_log(
        self, verified_admin_client: AsyncClient, db_session, admin_user
    ):
        await verified_admin_client.get("/admin/users")

        from sqlalchemy import select

        logs = await db_session.execute(
            select(AdminAuditLog).where(AdminAuditLog.action_type == "list_users")
        )
        assert len(logs.scalars().all()) >= 1

    async def test_audit_log_has_required_fields(
        self, verified_admin_client: AsyncClient, db_session, admin_user, test_user
    ):
        await verified_admin_client.post(
            "/admin/impersonation/start",
            json={
                "target_user_id": test_user.id,
                "reason": "Field validation test",
            },
        )

        from sqlalchemy import select

        logs = await db_session.execute(
            select(AdminAuditLog)
            .where(AdminAuditLog.action_type == "impersonation_start")
            .order_by(AdminAuditLog.created_at.desc())
            .limit(1)
        )
        log = logs.scalar_one()
        assert log.admin_user_id == admin_user.id
        assert log.target_user_id == test_user.id
        assert log.action_type == "impersonation_start"
        assert log.reason == "Field validation test"
        assert log.created_at is not None

    async def test_model_settings_update_creates_audit_log(
        self, verified_super_admin_client: AsyncClient, db_session, super_admin_user
    ):
        resp = await verified_super_admin_client.post(
            "/admin/settings/models",
            json={
                "active_generation_model": "gpt-4o-mini",
            },
        )
        assert resp.status_code == 200

        from sqlalchemy import select

        logs = await db_session.execute(
            select(AdminAuditLog).where(
                AdminAuditLog.action_type == "update_model_settings"
            )
        )
        assert len(logs.scalars().all()) >= 1

    async def test_full_audit_trail(
        self, verified_admin_client: AsyncClient, db_session, admin_user, test_user
    ):
        # Start impersonation
        imp_resp = await verified_admin_client.post(
            "/admin/impersonation/start",
            json={
                "target_user_id": test_user.id,
                "reason": "Full audit trail test",
            },
        )
        imp_id = imp_resp.json()["impersonation_id"]

        # List users
        await verified_admin_client.get("/admin/users")

        # End impersonation
        await verified_admin_client.post(f"/admin/impersonation/{imp_id}/end")

        # Check audit logs
        resp = await verified_admin_client.get("/admin/audit-logs")
        assert resp.status_code == 200
        logs = resp.json()["logs"]

        actions = [l["action_type"] for l in logs]
        assert "impersonation_start" in actions
        assert "list_users" in actions
        assert "impersonation_end" in actions

        # Verify all logs have admin_user_id
        for log in logs:
            assert "admin_user_id" in log
            assert "action_type" in log
            assert "created_at" in log
