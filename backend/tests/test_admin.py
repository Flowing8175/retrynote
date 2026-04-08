import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient

from app.models import (
    User,
    UserRole,
    AdminSettings,
    QuizSession,
    QuizSessionStatus,
    QuizMode,
    SourceMode,
    QuizItem,
    QuestionType,
    ImpersonationSession,
)
from app.middleware.auth import hash_password, create_access_token


class TestVerifyMasterPassword:
    async def test_verify_master_first_time(
        self, db_session, super_admin_client: AsyncClient, super_admin_user
    ):
        admin_settings = AdminSettings(
            master_password_hash=hash_password("FirstMasterPassword123!"),
        )
        db_session.add(admin_settings)
        await db_session.commit()

        resp = await super_admin_client.post(
            "/admin/login/verify-master",
            json={"master_password": "FirstMasterPassword123!"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["verified"] is True
        assert "admin_token" in data

    async def test_verify_master_wrong_password(
        self, db_session, admin_client: AsyncClient, admin_user
    ):
        """AdminSettings with different hash → 403"""
        # Create AdminSettings with a different password
        admin_settings = AdminSettings(
            id=str(uuid.uuid4()),
            master_password_hash=hash_password("CorrectPassword123!"),
        )
        db_session.add(admin_settings)
        await db_session.commit()

        resp = await admin_client.post(
            "/admin/login/verify-master",
            json={"master_password": "WrongPassword123!"},
        )
        assert resp.status_code == 403

    async def test_user_cannot_verify_master(self, auth_client: AsyncClient):
        """Regular user → 403"""
        resp = await auth_client.post(
            "/admin/login/verify-master",
            json={"master_password": "AnyPassword123!"},
        )
        assert resp.status_code == 403


class TestListUsers:
    async def test_list_users(self, admin_client: AsyncClient, test_user):
        """admin GETs /admin/users → 200, user list with total"""
        resp = await admin_client.get("/admin/users")
        assert resp.status_code == 200
        data = resp.json()
        assert "users" in data
        assert "total" in data
        assert data["total"] >= 1
        assert len(data["users"]) >= 1

    async def test_list_users_pagination(self, admin_client: AsyncClient, test_user):
        """page=1, size=5 → paginated"""
        resp = await admin_client.get("/admin/users", params={"page": 1, "size": 5})
        assert resp.status_code == 200
        data = resp.json()
        assert "users" in data
        assert "total" in data
        assert len(data["users"]) <= 5

    async def test_user_cannot_list_users(self, auth_client: AsyncClient):
        """Regular user → 403"""
        resp = await auth_client.get("/admin/users")
        assert resp.status_code == 403


class TestListLogs:
    async def test_list_logs(self, db_session, admin_client: AsyncClient):
        """admin GETs /admin/logs → 200, logs list"""
        from app.models import SystemLog

        log = SystemLog(
            id=str(uuid.uuid4()),
            level="info",
            service_name="test_service",
            event_type="test_event",
            message="Test log message",
        )
        db_session.add(log)
        await db_session.commit()

        resp = await admin_client.get("/admin/logs")
        assert resp.status_code == 200
        data = resp.json()
        assert "logs" in data
        assert "total" in data

    async def test_list_logs_filter_by_level(
        self, db_session, admin_client: AsyncClient
    ):
        """level=error → filtered"""
        from app.models import SystemLog

        error_log = SystemLog(
            id=str(uuid.uuid4()),
            level="error",
            service_name="test_service",
            event_type="test_error",
            message="Error log",
        )
        info_log = SystemLog(
            id=str(uuid.uuid4()),
            level="info",
            service_name="test_service",
            event_type="test_info",
            message="Info log",
        )
        db_session.add_all([error_log, info_log])
        await db_session.commit()

        resp = await admin_client.get("/admin/logs", params={"level": "error"})
        assert resp.status_code == 200
        data = resp.json()
        assert all(l["level"] == "error" for l in data["logs"])

    async def test_list_logs_filter_by_service(
        self, db_session, admin_client: AsyncClient
    ):
        """service_name=quiz_service → filtered"""
        from app.models import SystemLog

        log1 = SystemLog(
            id=str(uuid.uuid4()),
            level="info",
            service_name="quiz_service",
            event_type="test",
            message="Quiz service log",
        )
        log2 = SystemLog(
            id=str(uuid.uuid4()),
            level="info",
            service_name="other_service",
            event_type="test",
            message="Other service log",
        )
        db_session.add_all([log1, log2])
        await db_session.commit()

        resp = await admin_client.get(
            "/admin/logs", params={"service_name": "quiz_service"}
        )
        assert resp.status_code == 200
        data = resp.json()
        assert all(l["service_name"] == "quiz_service" for l in data["logs"])

    async def test_list_logs_filter_by_event_type(
        self, db_session, admin_client: AsyncClient
    ):
        """event_type=generation → filtered"""
        from app.models import SystemLog

        log1 = SystemLog(
            id=str(uuid.uuid4()),
            level="info",
            service_name="test",
            event_type="generation",
            message="Generation log",
        )
        log2 = SystemLog(
            id=str(uuid.uuid4()),
            level="info",
            service_name="test",
            event_type="grading",
            message="Grading log",
        )
        db_session.add_all([log1, log2])
        await db_session.commit()

        resp = await admin_client.get(
            "/admin/logs", params={"event_type": "generation"}
        )
        assert resp.status_code == 200
        data = resp.json()
        assert all(l["event_type"] == "generation" for l in data["logs"])

    async def test_user_cannot_list_logs(self, auth_client: AsyncClient):
        """Regular user → 403"""
        resp = await auth_client.get("/admin/logs")
        assert resp.status_code == 403


class TestModelUsage:
    async def test_get_model_usage(self, admin_client: AsyncClient):
        resp = await admin_client.get("/admin/model-usage")
        assert resp.status_code == 200
        data = resp.json()
        assert "usage" in data
        assert isinstance(data["usage"], list)
        for item in data["usage"]:
            assert "model_name" in item

    async def test_user_cannot_get_model_usage(self, auth_client: AsyncClient):
        """Regular user → 403"""
        resp = await auth_client.get("/admin/model-usage")
        assert resp.status_code == 403


class TestImpersonation:
    async def test_start_impersonation(
        self, db_session, verified_admin_client: AsyncClient, test_user
    ):
        """admin POSTs start with target_user_id and reason → 200"""
        resp = await verified_admin_client.post(
            "/admin/impersonation/start",
            json={
                "target_user_id": test_user.id,
                "reason": "Testing impersonation for support",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "impersonation_id" in data
        assert data["target_user_id"] == test_user.id
        assert data["target_username"] == test_user.username

    async def test_start_impersonation_nonexistent_user(
        self, verified_admin_client: AsyncClient
    ):
        """target_user_id doesn't exist → 404"""
        resp = await verified_admin_client.post(
            "/admin/impersonation/start",
            json={
                "target_user_id": str(uuid.uuid4()),
                "reason": "Testing with fake user",
            },
        )
        assert resp.status_code == 404

    async def test_end_impersonation(
        self, db_session, verified_admin_client: AsyncClient, admin_user, test_user
    ):
        """Start then end → 200"""
        # Create impersonation session
        imp_session = ImpersonationSession(
            id=str(uuid.uuid4()),
            admin_user_id=admin_user.id,
            target_user_id=test_user.id,
            reason="Testing end impersonation",
            is_active=True,
        )
        db_session.add(imp_session)
        await db_session.commit()

        resp = await verified_admin_client.post(
            f"/admin/impersonation/{imp_session.id}/end"
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "success"

        # Verify session is ended
        await db_session.refresh(imp_session)
        assert imp_session.is_active is False
        assert imp_session.ended_at is not None

    async def test_end_nonexistent_session(self, verified_admin_client: AsyncClient):
        """End fake session → 404"""
        resp = await verified_admin_client.post(
            f"/admin/impersonation/{str(uuid.uuid4())}/end"
        )
        assert resp.status_code == 404

    async def test_end_wrong_admin(
        self, db_session, client: AsyncClient, admin_user, test_user
    ):
        """Regular admin tries to end another admin's session → 403"""
        # Create impersonation session for first admin
        imp_session = ImpersonationSession(
            id=str(uuid.uuid4()),
            admin_user_id=admin_user.id,
            target_user_id=test_user.id,
            reason="Testing wrong admin",
            is_active=True,
        )
        db_session.add(imp_session)
        await db_session.commit()

        # Create another admin
        other_admin = User(
            id=str(uuid.uuid4()),
            username="otheradmin",
            email="otheradmin@example.com",
            password_hash=hash_password("AdminPass123!"),
            role=UserRole.admin,
            is_active=True,
        )
        db_session.add(other_admin)
        await db_session.commit()

        other_admin_token = create_access_token(other_admin.id, other_admin.role.value)
        resp = await client.post(
            f"/admin/impersonation/{imp_session.id}/end",
            headers={"Authorization": f"Bearer {other_admin_token}"},
        )
        assert resp.status_code == 403

    async def test_user_cannot_start_impersonation(
        self, auth_client: AsyncClient, test_user
    ):
        """Regular user → 403"""
        resp = await auth_client.post(
            "/admin/impersonation/start",
            json={
                "target_user_id": test_user.id,
                "reason": "Trying as regular user",
            },
        )
        assert resp.status_code == 403


class TestRegrade:
    async def test_regrade_item(
        self, db_session, verified_admin_client: AsyncClient, quiz_session_ready
    ):
        """admin POSTs regrade with item_id and reason → 200, regrade_job_id"""
        session, items = quiz_session_ready
        item = items[0]

        resp = await verified_admin_client.post(
            f"/admin/quiz-items/{item.id}/regrade",
            json={"reason": "Testing regrade for incorrect grading"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "regrade_job_id" in data

    async def test_regrade_nonexistent_item(self, verified_admin_client: AsyncClient):
        """fake item_id → 404"""
        resp = await verified_admin_client.post(
            f"/admin/quiz-items/{str(uuid.uuid4())}/regrade",
            json={"reason": "Testing with fake item"},
        )
        assert resp.status_code == 404

    async def test_user_cannot_regrade(
        self, auth_client: AsyncClient, quiz_session_ready
    ):
        """Regular user → 403"""
        session, items = quiz_session_ready
        item = items[0]

        resp = await auth_client.post(
            f"/admin/quiz-items/{item.id}/regrade",
            json={"reason": "Trying as regular user"},
        )
        assert resp.status_code == 403


class TestModelSettings:
    async def test_update_model_settings(
        self, verified_super_admin_client: AsyncClient
    ):
        """super_admin POSTs model settings → 200, settings returned"""
        resp = await verified_super_admin_client.post(
            "/admin/settings/models",
            json={
                "active_generation_model": "gpt-4o",
                "active_grading_model": "gpt-4o-mini",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "success"
        assert "settings" in data
        assert data["settings"]["active_generation_model"] == "gpt-4o"
        assert data["settings"]["active_grading_model"] == "gpt-4o-mini"

    async def test_admin_cannot_update_settings(self, admin_client: AsyncClient):
        """Regular admin → 403"""
        resp = await admin_client.post(
            "/admin/settings/models",
            json={
                "active_generation_model": "gpt-4o",
            },
        )
        assert resp.status_code == 403

    async def test_user_cannot_update_settings(self, auth_client: AsyncClient):
        """Regular user → 403"""
        resp = await auth_client.post(
            "/admin/settings/models",
            json={
                "active_generation_model": "gpt-4o",
            },
        )
        assert resp.status_code == 403


class TestAnnouncements:
    async def test_list_announcements(self, db_session, admin_client: AsyncClient):
        """admin GETs /admin/announcements → 200, list"""
        from app.models import Announcement

        announcement = Announcement(
            title="Test Announcement",
            body="This is a test announcement body.",
            is_active=True,
        )
        db_session.add(announcement)
        await db_session.commit()

        resp = await admin_client.get("/admin/announcements")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) >= 1

    async def test_create_announcement(self, verified_super_admin_client: AsyncClient):
        """super_admin POSTs announcement → 200 with title, body, is_active"""
        resp = await verified_super_admin_client.post(
            "/admin/announcements",
            json={
                "title": "New Feature Release",
                "body": "We have released a new feature for all users.",
                "is_active": True,
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["title"] == "New Feature Release"
        assert data["body"] == "We have released a new feature for all users."
        assert data["is_active"] is True

    async def test_admin_cannot_create_announcement(self, admin_client: AsyncClient):
        """Regular admin → 403"""
        resp = await admin_client.post(
            "/admin/announcements",
            json={
                "title": "Admin Announcement",
                "body": "Admin trying to create announcement.",
                "is_active": True,
            },
        )
        assert resp.status_code == 403

    async def test_user_cannot_list_announcements(self, auth_client: AsyncClient):
        """Regular user → 403"""
        resp = await auth_client.get("/admin/announcements")
        assert resp.status_code == 403


class TestAuditLogs:
    async def test_list_audit_logs(
        self, db_session, admin_client: AsyncClient, admin_user
    ):
        """admin GETs /admin/audit-logs → 200, logs with required fields"""
        from app.models import AdminAuditLog

        audit_log = AdminAuditLog(
            id=str(uuid.uuid4()),
            admin_user_id=admin_user.id,
            action_type="test_action",
        )
        db_session.add(audit_log)
        await db_session.commit()

        resp = await admin_client.get("/admin/audit-logs")
        assert resp.status_code == 200
        data = resp.json()
        assert "logs" in data
        assert "total" in data
        assert len(data["logs"]) >= 1
        # Check required fields
        log = data["logs"][0]
        assert "id" in log
        assert "admin_user_id" in log
        assert "action_type" in log
        assert "created_at" in log

    async def test_audit_logs_pagination(
        self, db_session, admin_client: AsyncClient, admin_user
    ):
        """page=1, size=5"""
        from app.models import AdminAuditLog

        # Create multiple audit logs
        for i in range(10):
            log = AdminAuditLog(
                id=str(uuid.uuid4()),
                admin_user_id=admin_user.id,
                action_type=f"action_{i}",
            )
            db_session.add(log)
        await db_session.commit()

        resp = await admin_client.get(
            "/admin/audit-logs", params={"page": 1, "size": 5}
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["logs"]) <= 5
        assert data["total"] >= 10

    async def test_user_cannot_list_audit_logs(self, auth_client: AsyncClient):
        resp = await auth_client.get("/admin/audit-logs")
        assert resp.status_code == 403


class TestDashboardKPIs:
    async def test_dashboard_kpis_returns_all_fields(self, admin_client: AsyncClient):
        resp = await admin_client.get("/admin/dashboard-kpis")
        assert resp.status_code == 200
        data = resp.json()

        for field in (
            "quizzes_today",
            "total_quiz_jobs",
            "total_storage_bytes",
            "ai_token_usage_24h",
            "signups_7d",
            "dau",
            "top_users_by_storage",
            "top_errors_24h",
            "job_queue",
        ):
            assert field in data, f"missing field: {field}"

        assert data["quizzes_today"] >= 0
        assert data["total_quiz_jobs"] >= 0
        assert data["total_storage_bytes"] >= 0
        assert data["ai_token_usage_24h"] >= 0
        assert data["signups_7d"] >= 0
        assert data["dau"] >= 0
        assert isinstance(data["top_users_by_storage"], list)
        assert isinstance(data["top_errors_24h"], list)
        assert isinstance(data["job_queue"], list)

    async def test_dashboard_kpis_counts_quiz_jobs(
        self, db_session, admin_client: AsyncClient
    ):
        from app.models import Job

        job = Job(
            id=str(uuid.uuid4()),
            job_type="generate_quiz",
            status="completed",
        )
        db_session.add(job)
        await db_session.commit()

        resp = await admin_client.get("/admin/dashboard-kpis")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_quiz_jobs"] >= 1

    async def test_dashboard_kpis_counts_ai_token_usage_24h(
        self, db_session, admin_client: AsyncClient
    ):
        from app.models import SystemLog

        log = SystemLog(
            id=str(uuid.uuid4()),
            level="INFO",
            service_name="ai_client",
            event_type="ai_token_usage",
            message="Token usage for model gpt-4o",
            meta_json={
                "model": "gpt-4o",
                "prompt_tokens": 100,
                "completion_tokens": 50,
                "total_tokens": 150,
            },
        )
        db_session.add(log)
        await db_session.commit()

        resp = await admin_client.get("/admin/dashboard-kpis")
        assert resp.status_code == 200
        data = resp.json()
        assert data["ai_token_usage_24h"] >= 1

    async def test_dashboard_kpis_top_users_no_email(
        self, db_session, admin_client: AsyncClient, test_user
    ):
        resp = await admin_client.get("/admin/dashboard-kpis")
        assert resp.status_code == 200
        data = resp.json()

        for entry in data["top_users_by_storage"]:
            assert "email" not in entry
            assert "username" in entry
            assert "storage_used_bytes" in entry

    async def test_dashboard_kpis_job_queue_groups_by_status_and_type(
        self, db_session, admin_client: AsyncClient
    ):
        from app.models import Job

        for status in ("pending", "completed"):
            db_session.add(
                Job(
                    id=str(uuid.uuid4()),
                    job_type="generate_quiz",
                    status=status,
                )
            )
        await db_session.commit()

        resp = await admin_client.get("/admin/dashboard-kpis")
        assert resp.status_code == 200
        data = resp.json()
        for entry in data["job_queue"]:
            assert "status" in entry
            assert "job_type" in entry
            assert "count" in entry

    async def test_user_cannot_get_dashboard_kpis(self, auth_client: AsyncClient):
        resp = await auth_client.get("/admin/dashboard-kpis")
        assert resp.status_code == 403


class TestJobManagement:
    async def test_list_jobs(self, db_session, admin_client: AsyncClient):
        from app.models import Job

        job = Job(
            id=str(uuid.uuid4()),
            job_type="generate_quiz",
            status="pending",
        )
        db_session.add(job)
        await db_session.commit()

        resp = await admin_client.get("/admin/jobs")
        assert resp.status_code == 200
        data = resp.json()
        assert "jobs" in data
        assert "total" in data
        assert data["total"] >= 1
        assert len(data["jobs"]) >= 1

    async def test_list_jobs_filter_by_status(
        self, db_session, admin_client: AsyncClient
    ):
        from app.models import Job

        job_failed = Job(
            id=str(uuid.uuid4()), job_type="generate_quiz", status="failed"
        )
        job_pending = Job(
            id=str(uuid.uuid4()), job_type="generate_quiz", status="pending"
        )
        db_session.add_all([job_failed, job_pending])
        await db_session.commit()

        resp = await admin_client.get("/admin/jobs", params={"status": "failed"})
        assert resp.status_code == 200
        data = resp.json()
        assert all(j["status"] == "failed" for j in data["jobs"])

    async def test_list_jobs_filter_by_job_type(
        self, db_session, admin_client: AsyncClient
    ):
        from app.models import Job

        job1 = Job(id=str(uuid.uuid4()), job_type="generate_quiz", status="pending")
        job2 = Job(id=str(uuid.uuid4()), job_type="grade_exam", status="pending")
        db_session.add_all([job1, job2])
        await db_session.commit()

        resp = await admin_client.get(
            "/admin/jobs", params={"job_type": "generate_quiz"}
        )
        assert resp.status_code == 200
        data = resp.json()
        assert all(j["job_type"] == "generate_quiz" for j in data["jobs"])

    async def test_retry_failed_job(
        self, db_session, verified_admin_client: AsyncClient
    ):
        from app.models import Job

        job = Job(
            id=str(uuid.uuid4()),
            job_type="generate_quiz",
            status="failed",
            error_message="Something went wrong",
            retry_count=0,
        )
        db_session.add(job)
        await db_session.commit()

        resp = await verified_admin_client.post(f"/admin/jobs/{job.id}/retry")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"

        await db_session.refresh(job)
        assert job.status == "pending"
        assert job.retry_count == 1
        assert job.error_message is None

    async def test_retry_completed_job_returns_400(
        self, db_session, verified_admin_client: AsyncClient
    ):
        from app.models import Job

        job = Job(
            id=str(uuid.uuid4()),
            job_type="generate_quiz",
            status="completed",
        )
        db_session.add(job)
        await db_session.commit()

        resp = await verified_admin_client.post(f"/admin/jobs/{job.id}/retry")
        assert resp.status_code == 400

    async def test_retry_pending_job_returns_400(
        self, db_session, verified_admin_client: AsyncClient
    ):
        from app.models import Job

        job = Job(
            id=str(uuid.uuid4()),
            job_type="generate_quiz",
            status="pending",
        )
        db_session.add(job)
        await db_session.commit()

        resp = await verified_admin_client.post(f"/admin/jobs/{job.id}/retry")
        assert resp.status_code == 400

    async def test_retry_nonexistent_job_returns_404(
        self, verified_admin_client: AsyncClient
    ):
        resp = await verified_admin_client.post(
            f"/admin/jobs/{str(uuid.uuid4())}/retry"
        )
        assert resp.status_code == 404

    async def test_cancel_pending_job(
        self, db_session, verified_admin_client: AsyncClient
    ):
        from app.models import Job

        job = Job(
            id=str(uuid.uuid4()),
            job_type="generate_quiz",
            status="pending",
        )
        db_session.add(job)
        await db_session.commit()

        resp = await verified_admin_client.post(f"/admin/jobs/{job.id}/cancel")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"

        await db_session.refresh(job)
        assert job.status == "failed"
        assert job.error_message == "Cancelled by admin"

    async def test_cancel_running_job(
        self, db_session, verified_admin_client: AsyncClient
    ):
        from app.models import Job

        job = Job(
            id=str(uuid.uuid4()),
            job_type="process_file",
            status="running",
        )
        db_session.add(job)
        await db_session.commit()

        resp = await verified_admin_client.post(f"/admin/jobs/{job.id}/cancel")
        assert resp.status_code == 200

        await db_session.refresh(job)
        assert job.status == "failed"
        assert job.error_message == "Cancelled by admin"

    async def test_cancel_completed_job_returns_400(
        self, db_session, verified_admin_client: AsyncClient
    ):
        from app.models import Job

        job = Job(
            id=str(uuid.uuid4()),
            job_type="generate_quiz",
            status="completed",
        )
        db_session.add(job)
        await db_session.commit()

        resp = await verified_admin_client.post(f"/admin/jobs/{job.id}/cancel")
        assert resp.status_code == 400

    async def test_cancel_failed_job_returns_400(
        self, db_session, verified_admin_client: AsyncClient
    ):
        from app.models import Job

        job = Job(
            id=str(uuid.uuid4()),
            job_type="generate_quiz",
            status="failed",
        )
        db_session.add(job)
        await db_session.commit()

        resp = await verified_admin_client.post(f"/admin/jobs/{job.id}/cancel")
        assert resp.status_code == 400

    async def test_cancel_nonexistent_job_returns_404(
        self, verified_admin_client: AsyncClient
    ):
        resp = await verified_admin_client.post(
            f"/admin/jobs/{str(uuid.uuid4())}/cancel"
        )
        assert resp.status_code == 404

    async def test_user_cannot_list_jobs(self, auth_client: AsyncClient):
        resp = await auth_client.get("/admin/jobs")
        assert resp.status_code == 403

    async def test_user_cannot_retry_job(self, db_session, auth_client: AsyncClient):
        from app.models import Job

        job = Job(
            id=str(uuid.uuid4()),
            job_type="generate_quiz",
            status="failed",
        )
        db_session.add(job)
        await db_session.commit()

        resp = await auth_client.post(f"/admin/jobs/{job.id}/retry")
        assert resp.status_code == 403

    async def test_user_cannot_cancel_job(self, db_session, auth_client: AsyncClient):
        from app.models import Job

        job = Job(
            id=str(uuid.uuid4()),
            job_type="generate_quiz",
            status="pending",
        )
        db_session.add(job)
        await db_session.commit()

        resp = await auth_client.post(f"/admin/jobs/{job.id}/cancel")
        assert resp.status_code == 403


class TestFilePipeline:
    async def test_pipeline_returns_200_with_structure(
        self, db_session, admin_client: AsyncClient, test_user
    ):
        from app.models import File, FileStatus, FileSourceType

        file_parsing = File(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            original_filename="processing.pdf",
            file_type="pdf",
            file_size_bytes=1024,
            source_type=FileSourceType.upload,
            status=FileStatus.parsing,
        )
        file_failed = File(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            original_filename="failed.pdf",
            file_type="pdf",
            file_size_bytes=512,
            source_type=FileSourceType.upload,
            status=FileStatus.failed_terminal,
        )
        db_session.add_all([file_parsing, file_failed])
        await db_session.commit()

        resp = await admin_client.get("/admin/files-pipeline")
        assert resp.status_code == 200
        data = resp.json()

        assert "status_breakdown" in data
        assert "in_progress" in data
        assert "recent_failures" in data
        assert isinstance(data["status_breakdown"], list)
        assert isinstance(data["in_progress"], list)
        assert isinstance(data["recent_failures"], list)

        for item in data["status_breakdown"]:
            assert "status" in item
            assert "count" in item

        in_prog_ids = [f["id"] for f in data["in_progress"]]
        assert file_parsing.id in in_prog_ids
        in_prog = next(f for f in data["in_progress"] if f["id"] == file_parsing.id)
        assert in_prog["username"] == test_user.username
        assert "email" not in in_prog
        assert in_prog["user_id"] == test_user.id
        assert "retry_count" in in_prog

        failure_ids = [f["id"] for f in data["recent_failures"]]
        assert file_failed.id in failure_ids
        failure = next(f for f in data["recent_failures"] if f["id"] == file_failed.id)
        assert failure["username"] == test_user.username
        assert "email" not in failure

    async def test_pipeline_empty_lists_are_valid(self, admin_client: AsyncClient):
        resp = await admin_client.get("/admin/files-pipeline")
        assert resp.status_code == 200
        data = resp.json()
        assert data["in_progress"] == []
        assert data["recent_failures"] == []
        assert data["status_breakdown"] == []

    async def test_only_in_progress_statuses_appear_in_in_progress(
        self, db_session, admin_client: AsyncClient, test_user
    ):
        from app.models import File, FileStatus, FileSourceType

        file_ready = File(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            original_filename="ready.pdf",
            file_type="pdf",
            file_size_bytes=1024,
            source_type=FileSourceType.upload,
            status=FileStatus.ready,
        )
        file_ocr = File(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            original_filename="ocr.pdf",
            file_type="pdf",
            file_size_bytes=1024,
            source_type=FileSourceType.upload,
            status=FileStatus.ocr_processing,
        )
        db_session.add_all([file_ready, file_ocr])
        await db_session.commit()

        resp = await admin_client.get("/admin/files-pipeline")
        assert resp.status_code == 200
        data = resp.json()

        in_prog_ids = [f["id"] for f in data["in_progress"]]
        assert file_ocr.id in in_prog_ids
        assert file_ready.id not in in_prog_ids

    async def test_user_cannot_access_pipeline(self, auth_client: AsyncClient):
        resp = await auth_client.get("/admin/files-pipeline")
        assert resp.status_code == 403


class TestRateLimits:
    async def test_rate_limits_returns_200_with_structure(
        self, admin_client: AsyncClient
    ):
        resp = await admin_client.get("/admin/rate-limits")
        assert resp.status_code == 200
        data = resp.json()
        assert "events" in data
        assert "total_events_24h" in data
        assert "unique_ips_count" in data
        assert "top_paths" in data
        assert isinstance(data["events"], list)
        assert isinstance(data["top_paths"], list)
        assert data["total_events_24h"] >= 0
        assert data["unique_ips_count"] >= 0

    async def test_rate_limits_empty_when_no_data(self, admin_client: AsyncClient):
        resp = await admin_client.get("/admin/rate-limits")
        assert resp.status_code == 200
        data = resp.json()
        assert data["events"] == []
        assert data["total_events_24h"] == 0
        assert data["unique_ips_count"] == 0
        assert data["top_paths"] == []

    async def test_rate_limits_aggregates_by_ip_and_path(
        self, db_session, admin_client: AsyncClient
    ):
        from app.models import SystemLog

        for _ in range(2):
            db_session.add(
                SystemLog(
                    id=str(uuid.uuid4()),
                    level="warning",
                    service_name="rate_limiter",
                    event_type="rate_limit_exceeded",
                    message="Rate limit exceeded",
                    meta_json={
                        "client_ip": "1.2.3.4",
                        "path": "/api/notes",
                        "method": "GET",
                    },
                )
            )
        db_session.add(
            SystemLog(
                id=str(uuid.uuid4()),
                level="warning",
                service_name="rate_limiter",
                event_type="rate_limit_exceeded",
                message="Rate limit exceeded",
                meta_json={
                    "client_ip": "5.6.7.8",
                    "path": "/api/quiz",
                    "method": "POST",
                },
            )
        )
        await db_session.commit()

        resp = await admin_client.get("/admin/rate-limits")
        assert resp.status_code == 200
        data = resp.json()

        assert data["total_events_24h"] == 3
        assert data["unique_ips_count"] == 2
        assert len(data["events"]) >= 2
        assert data["events"][0]["event_count"] >= data["events"][1]["event_count"]

        top = data["events"][0]
        assert top["client_ip"] == "1.2.3.4"
        assert top["path"] == "/api/notes"
        assert top["event_count"] == 2
        assert "latest_event" in top

    async def test_rate_limits_no_user_ids_exposed(
        self, db_session, admin_client: AsyncClient
    ):
        from app.models import SystemLog

        db_session.add(
            SystemLog(
                id=str(uuid.uuid4()),
                level="warning",
                service_name="rate_limiter",
                event_type="rate_limit_exceeded",
                message="Rate limit exceeded",
                meta_json={
                    "client_ip": "1.2.3.4",
                    "path": "/api/notes",
                    "user_id": "secret-id",
                    "method": "GET",
                },
            )
        )
        await db_session.commit()

        resp = await admin_client.get("/admin/rate-limits")
        assert resp.status_code == 200
        data = resp.json()
        for event in data["events"]:
            assert "user_id" not in event

    async def test_rate_limits_top_paths_max_five(
        self, db_session, admin_client: AsyncClient
    ):
        from app.models import SystemLog

        for i in range(7):
            db_session.add(
                SystemLog(
                    id=str(uuid.uuid4()),
                    level="warning",
                    service_name="rate_limiter",
                    event_type="rate_limit_exceeded",
                    message="Rate limit exceeded",
                    meta_json={
                        "client_ip": f"10.0.0.{i}",
                        "path": f"/api/path{i}",
                        "method": "GET",
                    },
                )
            )
        await db_session.commit()

        resp = await admin_client.get("/admin/rate-limits")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["top_paths"]) <= 5
        for entry in data["top_paths"]:
            assert "path" in entry
            assert "count" in entry

    async def test_user_cannot_access_rate_limits(self, auth_client: AsyncClient):
        resp = await auth_client.get("/admin/rate-limits")
        assert resp.status_code == 403


class TestDbDiagnostics:
    async def test_super_admin_gets_diagnostics(self, super_admin_client: AsyncClient):
        from app.schemas.admin import AdminDbTableInfo

        mock_tables = [
            AdminDbTableInfo(name="users", total_size="8 kB", row_estimate=10),
            AdminDbTableInfo(name="files", total_size="16 kB", row_estimate=5),
        ]
        with (
            patch(
                "app.api.admin._fetch_pg_table_info",
                new=AsyncMock(return_value=mock_tables),
            ),
            patch(
                "app.api.admin._fetch_pg_db_size",
                new=AsyncMock(return_value="24 kB"),
            ),
        ):
            resp = await super_admin_client.get("/admin/db-diagnostics")
        assert resp.status_code == 200
        data = resp.json()
        assert "tables" in data
        assert "migration_version" in data
        assert "db_total_size" in data
        assert "checked_at" in data
        assert isinstance(data["tables"], list)
        for table in data["tables"]:
            assert "name" in table
            assert "row_estimate" in table
            assert "total_size" in table

    async def test_plain_admin_gets_403(self, admin_client: AsyncClient):
        resp = await admin_client.get("/admin/db-diagnostics")
        assert resp.status_code == 403


class TestUserManagement:
    async def test_deactivate_user(
        self, db_session, verified_admin_client: AsyncClient, test_user
    ):
        """PATCH /admin/users/{id}/status → 200, user deactivated"""
        resp = await verified_admin_client.patch(
            f"/admin/users/{test_user.id}/status",
            json={"is_active": False},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["is_active"] is False
        assert data["id"] == test_user.id

        await db_session.refresh(test_user)
        assert test_user.is_active is False

    async def test_deactivate_last_super_admin_returns_400(
        self, db_session, verified_super_admin_client: AsyncClient, super_admin_user
    ):
        """Deactivating the only super_admin → 400 with clear error"""
        resp = await verified_super_admin_client.patch(
            f"/admin/users/{super_admin_user.id}/status",
            json={"is_active": False},
        )
        assert resp.status_code == 400
        assert "last super_admin" in resp.json()["detail"]

    async def test_update_user_role(
        self, db_session, verified_admin_client: AsyncClient, test_user
    ):
        """PATCH /admin/users/{id}/role → 200, role updated"""
        resp = await verified_admin_client.patch(
            f"/admin/users/{test_user.id}/role",
            json={"new_role": "admin"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == test_user.id
        assert data["role"] == "admin"

        await db_session.refresh(test_user)
        assert test_user.role == UserRole.admin

    async def test_admin_cannot_change_own_role(
        self, db_session, verified_admin_client: AsyncClient, admin_user
    ):
        """Admin changing own role → 400"""
        resp = await verified_admin_client.patch(
            f"/admin/users/{admin_user.id}/role",
            json={"new_role": "user"},
        )
        assert resp.status_code == 400
        assert "own role" in resp.json()["detail"]

    async def test_non_super_admin_cannot_grant_super_admin(
        self, db_session, verified_admin_client: AsyncClient, test_user
    ):
        """Non-super_admin granting super_admin role → 403"""
        resp = await verified_admin_client.patch(
            f"/admin/users/{test_user.id}/role",
            json={"new_role": "super_admin"},
        )
        assert resp.status_code == 403


class TestCSVExport:
    async def test_users_csv_has_bom(self, admin_client: AsyncClient, test_user):
        resp = await admin_client.get("/admin/export/users")
        assert resp.status_code == 200
        assert resp.content.startswith(b"\xef\xbb\xbf")

    async def test_users_csv_content_type(self, admin_client: AsyncClient):
        resp = await admin_client.get("/admin/export/users")
        assert resp.status_code == 200
        assert "text/csv" in resp.headers["content-type"]

    async def test_users_csv_has_correct_headers(
        self, admin_client: AsyncClient, test_user
    ):
        resp = await admin_client.get("/admin/export/users")
        assert resp.status_code == 200
        content = resp.content.decode("utf-8-sig")
        first_line = content.strip().split("\n")[0]
        headers = [h.strip() for h in first_line.split(",")]
        for col in (
            "id",
            "username",
            "email",
            "created_at",
            "storage_used_bytes",
            "is_active",
        ):
            assert col in headers

    async def test_users_csv_no_password_hash(
        self, admin_client: AsyncClient, test_user
    ):
        resp = await admin_client.get("/admin/export/users")
        assert resp.status_code == 200
        assert "password_hash" not in resp.text

    async def test_users_csv_filter_by_is_active(
        self, db_session, admin_client: AsyncClient, test_user
    ):
        inactive = User(
            id=str(uuid.uuid4()),
            username="inactive_export_user",
            email="inactive_export@example.com",
            password_hash=hash_password("Pass123!"),
            role=UserRole.user,
            is_active=False,
        )
        db_session.add(inactive)
        await db_session.commit()

        resp = await admin_client.get(
            "/admin/export/users", params={"is_active": False}
        )
        assert resp.status_code == 200
        content = resp.text
        assert "inactive_export_user" in content
        assert "testuser" not in content

    async def test_user_cannot_export_users(self, auth_client: AsyncClient):
        resp = await auth_client.get("/admin/export/users")
        assert resp.status_code == 403

    async def test_logs_csv_has_bom(self, db_session, admin_client: AsyncClient):
        from app.models import SystemLog

        db_session.add(
            SystemLog(
                id=str(uuid.uuid4()),
                level="ERROR",
                service_name="test_svc",
                event_type="test_event",
                message="Test error",
            )
        )
        await db_session.commit()

        resp = await admin_client.get("/admin/export/logs")
        assert resp.status_code == 200
        assert resp.content.startswith(b"\xef\xbb\xbf")

    async def test_logs_csv_has_correct_headers(self, admin_client: AsyncClient):
        resp = await admin_client.get("/admin/export/logs")
        assert resp.status_code == 200
        content = resp.content.decode("utf-8-sig")
        first_line = content.strip().split("\n")[0]
        headers = [h.strip() for h in first_line.split(",")]
        for col in ("created_at", "level", "service_name", "event_type", "message"):
            assert col in headers

    async def test_logs_csv_filter_by_level(
        self, db_session, admin_client: AsyncClient
    ):
        from app.models import SystemLog

        db_session.add(
            SystemLog(
                id=str(uuid.uuid4()),
                level="ERROR",
                service_name="svc",
                event_type="err",
                message="Error message",
            )
        )
        db_session.add(
            SystemLog(
                id=str(uuid.uuid4()),
                level="INFO",
                service_name="svc",
                event_type="info",
                message="Info message",
            )
        )
        await db_session.commit()

        resp = await admin_client.get("/admin/export/logs", params={"level": "ERROR"})
        assert resp.status_code == 200
        content = resp.content.decode("utf-8-sig")
        lines = [l for l in content.strip().split("\n") if l]
        data_lines = lines[1:]
        assert len(data_lines) == 1
        assert "ERROR" in data_lines[0]

    async def test_logs_csv_no_raw_meta_json(
        self, db_session, admin_client: AsyncClient
    ):
        from app.models import SystemLog

        db_session.add(
            SystemLog(
                id=str(uuid.uuid4()),
                level="INFO",
                service_name="svc",
                event_type="test",
                message="Test message",
                meta_json={"secret_key": "secret_value"},
            )
        )
        await db_session.commit()

        resp = await admin_client.get("/admin/export/logs")
        assert resp.status_code == 200
        assert "meta_json" not in resp.text
        assert "secret_key" not in resp.text

    async def test_user_cannot_export_logs(self, auth_client: AsyncClient):
        resp = await auth_client.get("/admin/export/logs")
        assert resp.status_code == 403

    async def test_audit_logs_csv_requires_verified_admin(
        self, admin_client: AsyncClient
    ):
        resp = await admin_client.get("/admin/export/audit-logs")
        assert resp.status_code == 403

    async def test_audit_logs_csv_has_bom(
        self, db_session, verified_admin_client: AsyncClient, admin_user
    ):
        from app.models import AdminAuditLog

        db_session.add(
            AdminAuditLog(
                id=str(uuid.uuid4()),
                admin_user_id=admin_user.id,
                action_type="test_action",
            )
        )
        await db_session.commit()

        resp = await verified_admin_client.get("/admin/export/audit-logs")
        assert resp.status_code == 200
        assert resp.content.startswith(b"\xef\xbb\xbf")

    async def test_audit_logs_csv_has_correct_headers(
        self, verified_admin_client: AsyncClient
    ):
        resp = await verified_admin_client.get("/admin/export/audit-logs")
        assert resp.status_code == 200
        content = resp.content.decode("utf-8-sig")
        first_line = content.strip().split("\n")[0]
        headers = [h.strip() for h in first_line.split(",")]
        for col in (
            "created_at",
            "admin_user_id",
            "target_user_id",
            "action_type",
            "target_type",
            "ip_address",
        ):
            assert col in headers

    async def test_user_cannot_export_audit_logs(self, auth_client: AsyncClient):
        resp = await auth_client.get("/admin/export/audit-logs")
        assert resp.status_code == 403
