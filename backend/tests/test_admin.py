import uuid
import pytest
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
