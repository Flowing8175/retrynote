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
from app.models.user import UserRole
from app.middleware.auth import hash_password, create_access_token, create_admin_token
from .conftest import make_quiz_items


class TestE2EScenario1FullUserFlow:
    """회원가입 → 로그인 → 파일 업로드 → 처리 완료 → 퀴즈 생성 → 일반 모드 풀이 → 채점 → 오답노트 확인"""

    async def test_full_user_flow(self, client: AsyncClient, db_session):
        # Step 1: Signup
        signup_resp = await client.post(
            "/auth/signup",
            json={
                "username": "e2e_user1",
                "email": "e2e1@example.com",
                "password": "E2EPass123!",
            },
        )
        assert signup_resp.status_code == 200
        user_id = signup_resp.json()["user_id"]

        # Step 2: Login
        login_resp = await client.post(
            "/auth/login",
            json={
                "username_or_email": "e2e_user1",
                "password": "E2EPass123!",
            },
        )
        assert login_resp.status_code == 200
        token = login_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Step 3: File upload (manual text)
        file_resp = await client.post(
            "/files",
            data={
                "manual_text": "사회복지실천기술에서 면담은 핵심 요소이다. 면담의 목적은 정보 수집, 문제 진단, 관계 형성이다."
            },
            headers=headers,
        )
        assert file_resp.status_code == 200
        file_id = file_resp.json()["file_id"]

        # Step 4: Mock file processing to ready
        file_record = (
            await db_session.execute(
                __import__("sqlalchemy").select(File).where(File.id == file_id)
            )
        ).scalar_one()
        file_record.status = FileStatus.ready
        file_record.is_searchable = True
        file_record.is_quiz_eligible = True
        await db_session.commit()

        # Verify file status
        file_detail_resp = await client.get(f"/files/{file_id}", headers=headers)
        assert file_detail_resp.json()["status"] == "ready"

        # Step 5: Create quiz session
        quiz_resp = await client.post(
            "/quiz-sessions",
            json={
                "mode": "normal",
                "selected_file_ids": [file_id],
                "question_count": 3,
                "source_mode": "document_based",
            },
            headers=headers,
        )
        assert quiz_resp.status_code == 200
        session_id = quiz_resp.json()["quiz_session_id"]
        assert quiz_resp.json()["status"] in ("draft", "generating")

        # Step 6: Mock quiz generation - create items directly
        session = (
            await db_session.execute(
                __import__("sqlalchemy")
                .select(QuizSession)
                .where(QuizSession.id == session_id)
            )
        ).scalar_one()
        session.status = QuizSessionStatus.ready
        items = make_quiz_items(session_id, count=3)
        for item in items:
            db_session.add(item)
        await db_session.commit()

        # Verify items
        items_resp = await client.get(
            f"/quiz-sessions/{session_id}/items", headers=headers
        )
        assert items_resp.status_code == 200
        assert len(items_resp.json()) == 3

        # Step 7: Answer questions (normal mode - immediate grading)
        for i, item in enumerate(items):
            answer = "A" if i == 0 else "B"
            ans_resp = await client.post(
                f"/quiz-sessions/{session_id}/items/{item.id}/answer",
                json={"user_answer": answer},
                headers=headers,
            )
            assert ans_resp.status_code == 200
            data = ans_resp.json()
            assert "judgement" in data
            assert "score_awarded" in data

        # Step 8: Verify session is graded
        await db_session.refresh(session)
        assert session.status == QuizSessionStatus.graded

        # Step 9: Check wrong notes
        notes_resp = await client.get("/wrong-notes", headers=headers)
        assert notes_resp.status_code == 200
        notes_data = notes_resp.json()
        assert notes_data["total"] >= 1


class TestE2EScenario2ExamModeFlow:
    """시험 모드 생성 → 임시저장 → 복귀 → 최종 제출 → 일괄 채점 → 결과 확인"""

    async def test_exam_mode_flow(self, client: AsyncClient, db_session):
        # Setup user
        signup_resp = await client.post(
            "/auth/signup",
            json={
                "username": "e2e_exam_user",
                "email": "e2e_exam@example.com",
                "password": "E2EPass123!",
            },
        )
        user_id = signup_resp.json()["user_id"]
        login_resp = await client.post(
            "/auth/login",
            json={
                "username_or_email": "e2e_exam_user",
                "password": "E2EPass123!",
            },
        )
        headers = {"Authorization": f"Bearer {login_resp.json()['access_token']}"}

        # Create file and make it ready
        file_resp = await client.post(
            "/files",
            data={"manual_text": "테스트 자료 내용입니다."},
            headers=headers,
        )
        file_id = file_resp.json()["file_id"]
        file_record = (
            await db_session.execute(
                __import__("sqlalchemy").select(File).where(File.id == file_id)
            )
        ).scalar_one()
        file_record.status = FileStatus.ready
        file_record.is_searchable = True
        file_record.is_quiz_eligible = True
        await db_session.commit()

        # Create exam session
        quiz_resp = await client.post(
            "/quiz-sessions",
            json={
                "mode": "exam",
                "selected_file_ids": [file_id],
                "question_count": 3,
                "source_mode": "document_based",
            },
            headers=headers,
        )
        session_id = quiz_resp.json()["quiz_session_id"]

        # Mock generation
        session = (
            await db_session.execute(
                __import__("sqlalchemy")
                .select(QuizSession)
                .where(QuizSession.id == session_id)
            )
        ).scalar_one()
        session.status = QuizSessionStatus.ready
        items = make_quiz_items(session_id, count=3)
        for item in items:
            db_session.add(item)
        await db_session.commit()

        # Save draft answers
        for item in items[:2]:
            draft_resp = await client.post(
                f"/quiz-sessions/{session_id}/draft-answer",
                json={"item_id": item.id, "user_answer": "A"},
                headers=headers,
            )
            assert draft_resp.status_code == 200

        # Update draft (simulate return/recovery)
        draft_resp2 = await client.post(
            f"/quiz-sessions/{session_id}/draft-answer",
            json={"item_id": items[0].id, "user_answer": "B"},
            headers=headers,
        )
        assert draft_resp2.status_code == 200

        # Save last item draft
        await client.post(
            f"/quiz-sessions/{session_id}/draft-answer",
            json={"item_id": items[2].id, "user_answer": "C"},
            headers=headers,
        )

        # Final submit with idempotency key
        idem_key = str(uuid.uuid4())
        submit_resp = await client.post(
            f"/quiz-sessions/{session_id}/submit",
            json={"idempotency_key": idem_key},
            headers=headers,
        )
        assert submit_resp.status_code == 200
        submit_data = submit_resp.json()
        assert submit_data["status"] in ("submitted", "grading")
        assert "job_id" in submit_data

        # Duplicate submit with same key returns same result
        submit_resp2 = await client.post(
            f"/quiz-sessions/{session_id}/submit",
            json={"idempotency_key": idem_key},
            headers=headers,
        )
        assert submit_resp2.status_code == 200
        assert submit_resp2.json()["status"] == submit_data["status"]

        # Check session state
        await db_session.refresh(session)
        assert session.status in (
            QuizSessionStatus.submitted,
            QuizSessionStatus.grading,
        )


class TestE2EScenario3RetryFlow:
    """오답노트에서 재도전 생성 → 재도전 풀이 → 대시보드 반영"""

    async def test_retry_flow(self, client: AsyncClient, db_session):
        # Setup
        signup_resp = await client.post(
            "/auth/signup",
            json={
                "username": "e2e_retry_user",
                "email": "e2e_retry@example.com",
                "password": "E2EPass123!",
            },
        )
        user_id = signup_resp.json()["user_id"]
        login_resp = await client.post(
            "/auth/login",
            json={
                "username_or_email": "e2e_retry_user",
                "password": "E2EPass123!",
            },
        )
        headers = {"Authorization": f"Bearer {login_resp.json()['access_token']}"}

        # Create a completed quiz with wrong answers
        file_resp = await client.post(
            "/files",
            data={"manual_text": "재도전 테스트 자료"},
            headers=headers,
        )
        file_id = file_resp.json()["file_id"]
        file_record = (
            await db_session.execute(
                __import__("sqlalchemy").select(File).where(File.id == file_id)
            )
        ).scalar_one()
        file_record.status = FileStatus.ready
        file_record.is_searchable = True
        file_record.is_quiz_eligible = True
        await db_session.commit()

        # Create completed session with incorrect answers
        session = QuizSession(
            id=str(uuid.uuid4()),
            user_id=user_id,
            mode=QuizMode.normal,
            source_mode=SourceMode.document_based,
            status=QuizSessionStatus.graded,
            question_count=2,
            total_score=1.0,
            max_score=2.0,
        )
        db_session.add(session)
        await db_session.flush()

        sf = QuizSessionFile(
            id=str(uuid.uuid4()),
            quiz_session_id=session.id,
            file_id=file_id,
        )
        db_session.add(sf)

        items = make_quiz_items(session.id, count=2)
        for item in items:
            db_session.add(item)
        await db_session.flush()

        # Create answer logs (one correct, one incorrect)
        correct_log = AnswerLog(
            id=str(uuid.uuid4()),
            quiz_item_id=items[0].id,
            quiz_session_id=session.id,
            user_id=user_id,
            user_answer_raw="A",
            user_answer_normalized="a",
            judgement=Judgement.correct,
            score_awarded=1.0,
            max_score=1.0,
            is_active_result=True,
            graded_at=datetime.now(timezone.utc),
        )
        incorrect_log = AnswerLog(
            id=str(uuid.uuid4()),
            quiz_item_id=items[1].id,
            quiz_session_id=session.id,
            user_id=user_id,
            user_answer_raw="B",
            user_answer_normalized="b",
            judgement=Judgement.incorrect,
            score_awarded=0.0,
            max_score=1.0,
            error_type=ErrorType.careless_mistake,
            is_active_result=True,
            graded_at=datetime.now(timezone.utc),
        )
        db_session.add(correct_log)
        db_session.add(incorrect_log)

        # Create weak point for retry
        weak = WeakPoint(
            id=str(uuid.uuid4()),
            user_id=user_id,
            concept_key="test_concept_2",
            concept_label="Test Concept 2",
            wrong_count=1,
            last_wrong_at=datetime.now(timezone.utc),
        )
        db_session.add(weak)
        await db_session.commit()

        # Step 1: Create retry from wrong notes
        retry_resp = await client.post(
            "/retry-sets",
            json={
                "source": "wrong_notes",
                "size": 3,
            },
            headers=headers,
        )
        assert retry_resp.status_code == 200
        retry_data = retry_resp.json()
        assert "quiz_session_id" in retry_data
        assert "job_id" in retry_data

        retry_session_id = retry_data["quiz_session_id"]

        # Step 2: Mock retry generation
        retry_session = (
            await db_session.execute(
                __import__("sqlalchemy")
                .select(QuizSession)
                .where(QuizSession.id == retry_session_id)
            )
        ).scalar_one()
        assert retry_session.mode == QuizMode.normal
        assert retry_session.generation_priority == "retry"

        retry_session.status = QuizSessionStatus.ready
        retry_items = make_quiz_items(retry_session_id, count=3)
        for item in retry_items:
            db_session.add(item)
        await db_session.commit()

        # Step 3: Take retry quiz
        for item in retry_items:
            await client.post(
                f"/quiz-sessions/{retry_session_id}/items/{item.id}/answer",
                json={"user_answer": "A"},
                headers=headers,
            )

        # Step 4: Check dashboard reflects results
        dashboard_resp = await client.get("/dashboard", headers=headers)
        assert dashboard_resp.status_code == 200
        dashboard = dashboard_resp.json()
        assert dashboard["learning_volume"] >= 0
        assert "overall_accuracy" in dashboard
        assert "score_rate" in dashboard


class TestE2EScenario4ObjectionFlow:
    """채점 결과 이의제기 → 재판정 → 통계 재반영"""

    async def test_objection_flow(self, client: AsyncClient, db_session):
        # Setup user and completed quiz
        signup_resp = await client.post(
            "/auth/signup",
            json={
                "username": "e2e_obj_user",
                "email": "e2e_obj@example.com",
                "password": "E2EPass123!",
            },
        )
        user_id = signup_resp.json()["user_id"]
        login_resp = await client.post(
            "/auth/login",
            json={
                "username_or_email": "e2e_obj_user",
                "password": "E2EPass123!",
            },
        )
        headers = {"Authorization": f"Bearer {login_resp.json()['access_token']}"}

        # Create file and completed session
        file_resp = await client.post(
            "/files",
            data={"manual_text": "이의제기 테스트 자료"},
            headers=headers,
        )
        file_id = file_resp.json()["file_id"]
        file_record = (
            await db_session.execute(
                __import__("sqlalchemy").select(File).where(File.id == file_id)
            )
        ).scalar_one()
        file_record.status = FileStatus.ready
        file_record.is_searchable = True
        file_record.is_quiz_eligible = True
        await db_session.commit()

        session = QuizSession(
            id=str(uuid.uuid4()),
            user_id=user_id,
            mode=QuizMode.normal,
            source_mode=SourceMode.document_based,
            status=QuizSessionStatus.graded,
            question_count=1,
            total_score=0.0,
            max_score=1.0,
        )
        db_session.add(session)
        await db_session.flush()

        sf = QuizSessionFile(
            id=str(uuid.uuid4()),
            quiz_session_id=session.id,
            file_id=file_id,
        )
        db_session.add(sf)

        item = QuizItem(
            id=str(uuid.uuid4()),
            quiz_session_id=session.id,
            item_order=1,
            question_type=QuestionType.ox,
            question_text="테스트 문제입니다.",
            correct_answer_json={"answer": "O"},
            explanation_text="해설입니다.",
            concept_key="objection_test",
            concept_label="이의제기 테스트",
        )
        db_session.add(item)
        await db_session.flush()

        answer_log = AnswerLog(
            id=str(uuid.uuid4()),
            quiz_item_id=item.id,
            quiz_session_id=session.id,
            user_id=user_id,
            user_answer_raw="X",
            user_answer_normalized="x",
            judgement=Judgement.incorrect,
            score_awarded=0.0,
            max_score=1.0,
            error_type=ErrorType.careless_mistake,
            is_active_result=True,
            graded_at=datetime.now(timezone.utc),
        )
        db_session.add(answer_log)
        await db_session.commit()

        # Step 1: Submit objection
        obj_resp = await client.post(
            f"/quiz-sessions/{session.id}/items/{item.id}/objections",
            json={
                "answer_log_id": answer_log.id,
                "objection_reason": "정답은 X가 맞습니다. 근거 자료를 확인해주세요.",
            },
            headers=headers,
        )
        assert obj_resp.status_code == 200
        objection_id = obj_resp.json()["objection_id"]
        assert obj_resp.json()["status"] == "under_review"

        # Verify session status changed
        await db_session.refresh(session)
        assert session.status == QuizSessionStatus.objection_pending

        # Step 2: Mock objection review (upheld)
        objection = (
            await db_session.execute(
                __import__("sqlalchemy")
                .select(Objection)
                .where(Objection.id == objection_id)
            )
        ).scalar_one()
        objection.status = ObjectionStatus.upheld
        objection.review_result_json = {
            "decision": "upheld",
            "reasoning": "사용자 주장이 타당합니다.",
            "updated_judgement": "correct",
            "updated_score_awarded": 1.0,
        }
        objection.decided_at = datetime.now(timezone.utc)
        objection.decided_by = "ai"

        # Step 3: Apply regrade - deactivate old, create new active
        answer_log.is_active_result = False
        new_log = AnswerLog(
            id=str(uuid.uuid4()),
            quiz_item_id=item.id,
            quiz_session_id=session.id,
            user_id=user_id,
            user_answer_raw=answer_log.user_answer_raw,
            user_answer_normalized=answer_log.user_answer_normalized,
            judgement=Judgement.correct,
            score_awarded=1.0,
            max_score=1.0,
            is_active_result=True,
            graded_at=datetime.now(timezone.utc),
            regraded_from_answer_log_id=answer_log.id,
        )
        db_session.add(new_log)

        session.status = QuizSessionStatus.regraded
        session.total_score = 1.0
        objection.status = ObjectionStatus.applied
        await db_session.commit()

        # Step 4: Verify active result updated
        old_check = (
            await db_session.execute(
                __import__("sqlalchemy")
                .select(AnswerLog)
                .where(AnswerLog.id == answer_log.id)
            )
        ).scalar_one()
        assert old_check.is_active_result is False

        new_check = (
            await db_session.execute(
                __import__("sqlalchemy")
                .select(AnswerLog)
                .where(AnswerLog.id == new_log.id)
            )
        ).scalar_one()
        assert new_check.is_active_result is True
        assert new_check.judgement == Judgement.correct

        # Step 5: Verify dashboard reflects updated result
        dashboard_resp = await client.get("/dashboard", headers=headers)
        assert dashboard_resp.status_code == 200
        dashboard = dashboard_resp.json()
        assert dashboard["score_rate"] == 1.0


class TestE2EScenario5AdminImpersonation:
    """관리자 로그인 → 마스터 검증 → 가장 모드 진입 → 조회 → 재판정 트리거 → 감사 로그 확인"""

    async def test_admin_impersonation_flow(self, client: AsyncClient, db_session):
        # Setup target user with data
        target_signup = await client.post(
            "/auth/signup",
            json={
                "username": "target_user",
                "email": "target@example.com",
                "password": "TargetPass123!",
            },
        )
        target_user_id = target_signup.json()["user_id"]

        target_login = await client.post(
            "/auth/login",
            json={
                "username_or_email": "target_user",
                "password": "TargetPass123!",
            },
        )
        target_headers = {
            "Authorization": f"Bearer {target_login.json()['access_token']}"
        }

        # Target uploads a file
        file_resp = await client.post(
            "/files",
            data={"manual_text": "타겟 사용자의 파일 내용"},
            headers=target_headers,
        )
        target_file_id = file_resp.json()["file_id"]

        # Setup admin user
        admin_user = __import__("app.models.user", fromlist=["User"]).User(
            id=str(uuid.uuid4()),
            username="e2e_admin",
            email="e2e_admin@example.com",
            password_hash=hash_password("AdminPass123!"),
            role=UserRole.admin,
            is_active=True,
        )
        db_session.add(admin_user)

        # Setup admin settings with master password hash
        admin_settings = __import__(
            "app.models.user", fromlist=["AdminSettings"]
        ).AdminSettings(
            id=str(uuid.uuid4()),
            updated_by=hash_password("master_secret"),
        )
        db_session.add(admin_settings)
        await db_session.commit()
        await db_session.refresh(admin_user)

        admin_token = create_access_token(admin_user.id, admin_user.role.value)
        admin_jwt = create_admin_token(admin_user.id)
        admin_headers = {
            "Authorization": f"Bearer {admin_token}",
            "X-Admin-Token": admin_jwt,
        }

        # Step 1: Admin login & verify master password
        verify_resp = await client.post(
            "/admin/login/verify-master",
            json={"master_password": "master_secret"},
            headers=admin_headers,
        )
        assert verify_resp.status_code == 200
        assert verify_resp.json()["verified"] is True

        # Step 2: Start impersonation
        imp_resp = await client.post(
            "/admin/impersonation/start",
            json={
                "target_user_id": target_user_id,
                "reason": "Debugging grading issue for target user",
            },
            headers=admin_headers,
        )
        assert imp_resp.status_code == 200
        imp_data = imp_resp.json()
        impersonation_id = imp_data["impersonation_id"]
        assert imp_data["target_username"] == "target_user"

        # Step 3: Admin views user list
        users_resp = await client.get("/admin/users", headers=admin_headers)
        assert users_resp.status_code == 200
        assert users_resp.json()["total"] >= 2

        # Step 4: Create a quiz item for regrade target
        target_file = (
            await db_session.execute(
                __import__("sqlalchemy").select(File).where(File.id == target_file_id)
            )
        ).scalar_one()
        target_file.status = FileStatus.ready
        target_file.is_searchable = True
        target_file.is_quiz_eligible = True

        session = QuizSession(
            id=str(uuid.uuid4()),
            user_id=target_user_id,
            mode=QuizMode.normal,
            source_mode=SourceMode.document_based,
            status=QuizSessionStatus.graded,
            question_count=1,
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
            question_text="재판정 대상 문제",
            correct_answer_json={"answer": "B"},
        )
        db_session.add(item)
        await db_session.commit()
        await db_session.refresh(item)

        # Step 5: Trigger regrade
        regrade_resp = await client.post(
            f"/admin/quiz-items/{item.id}/regrade",
            json={"reason": "잘못된 채점으로 확인됨"},
            headers=admin_headers,
        )
        assert regrade_resp.status_code == 200
        assert "regrade_job_id" in regrade_resp.json()

        # Step 6: End impersonation
        end_imp_resp = await client.post(
            f"/admin/impersonation/{impersonation_id}/end",
            headers=admin_headers,
        )
        assert end_imp_resp.status_code == 200

        # Step 7: Check audit logs
        logs_resp = await client.get("/admin/audit-logs", headers=admin_headers)
        assert logs_resp.status_code == 200
        logs_data = logs_resp.json()
        assert logs_data["total"] >= 3

        log_actions = [l["action_type"] for l in logs_data["logs"]]
        assert "impersonation_start" in log_actions
        assert "regrade_request" in log_actions
        assert "impersonation_end" in log_actions

        # Verify audit log fields
        for log in logs_data["logs"]:
            assert "admin_user_id" in log
            assert "action_type" in log
            assert "ip_address" in log
            assert "created_at" in log
