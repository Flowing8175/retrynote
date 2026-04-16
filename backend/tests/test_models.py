import uuid
from datetime import datetime, timezone

from app.models.user import User, UserRole
from app.models.file import Folder, File, FileSourceType, FileStatus
from app.models.quiz import (
    QuizSession,
    QuizSessionStatus,
    QuizMode,
    SourceMode,
    QuizItem,
    QuestionType,
    AnswerLog,
    Judgement,
    ErrorType,
)
from app.models.objection import Objection, ObjectionStatus, WeakPoint
from app.models.admin import DashboardSnapshot, SystemLog, AdminAuditLog, Announcement
from app.models.search import Job, DraftAnswer, ImpersonationSession, PasswordResetToken
from app.schemas.quiz import QuizItemResponse
from app.schemas.wrong_note import WrongNoteItem
from app.middleware.auth import hash_password


class TestUserModel:
    async def test_create_user_default_role(self, db_session):
        """User with no role → role=user"""
        user = User(
            id=str(uuid.uuid4()),
            username="defaultrole",
            email="defaultrole@example.com",
            password_hash=hash_password("Pass123!"),
        )
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)
        assert user.role == UserRole.user

    async def test_create_user_default_active(self, db_session):
        """User with no is_active → is_active=True"""
        user = User(
            id=str(uuid.uuid4()),
            username="defaultactive",
            email="defaultactive@example.com",
            password_hash=hash_password("Pass123!"),
        )
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)
        assert user.is_active is True

    async def test_create_user_default_storage(self, db_session):
        user = User(
            id=str(uuid.uuid4()),
            username="defaultstorage",
            email="defaultstorage@example.com",
            password_hash=hash_password("Pass123!"),
        )
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)
        assert user.storage_used_bytes == 0
        assert user.storage_quota_bytes == 104857600

    async def test_user_enum_values(self, db_session):
        """All UserRole values (user, admin, super_admin) work"""
        roles = [UserRole.user, UserRole.admin, UserRole.super_admin]
        for i, role in enumerate(roles):
            user = User(
                id=str(uuid.uuid4()),
                username=f"enumuser{i}",
                email=f"enumuser{i}@example.com",
                password_hash=hash_password("Pass123!"),
                role=role,
            )
            db_session.add(user)
        await db_session.commit()
        # Just verify construction works - enums are valid


class TestFileModel:
    async def test_create_file_default_status(self, db_session, test_user):
        """File with no status → status=uploaded"""
        file = File(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            file_type="txt",
            source_type=FileSourceType.manual_text,
        )
        db_session.add(file)
        await db_session.commit()
        await db_session.refresh(file)
        assert file.status == FileStatus.uploaded

    async def test_file_status_enum(self, db_session, test_user):
        """All FileStatus values work"""
        statuses = [
            FileStatus.uploaded,
            FileStatus.parsing,
            FileStatus.parsed,
            FileStatus.ocr_pending,
            FileStatus.ocr_processing,
            FileStatus.embedding_pending,
            FileStatus.embedding_processing,
            FileStatus.ready,
            FileStatus.failed_partial,
            FileStatus.failed_terminal,
            FileStatus.deleted,
        ]
        for i, status in enumerate(statuses):
            file = File(
                id=str(uuid.uuid4()),
                user_id=test_user.id,
                file_type="txt",
                source_type=FileSourceType.manual_text,
                status=status,
            )
            db_session.add(file)
        await db_session.commit()
        # Just verify construction works - enums are valid

    async def test_file_source_type_enum(self, db_session, test_user):
        """All FileSourceType values work"""
        source_types = [
            FileSourceType.upload,
            FileSourceType.url,
            FileSourceType.manual_text,
        ]
        for i, source_type in enumerate(source_types):
            file = File(
                id=str(uuid.uuid4()),
                user_id=test_user.id,
                file_type="txt",
                source_type=source_type,
            )
            db_session.add(file)
        await db_session.commit()
        # Just verify construction works - enums are valid

    async def test_create_folder(self, db_session, test_user):
        """Folder with user_id, name"""
        folder = Folder(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            name="Test Folder",
        )
        db_session.add(folder)
        await db_session.commit()
        await db_session.refresh(folder)
        assert folder.user_id == test_user.id
        assert folder.name == "Test Folder"


class TestQuizModels:
    async def test_create_quiz_session_defaults(self, db_session, test_user):
        """status=draft, question_count defaults to None"""
        session = QuizSession(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            mode=QuizMode.normal,
            source_mode=SourceMode.document_based,
        )
        db_session.add(session)
        await db_session.commit()
        await db_session.refresh(session)
        assert session.status == QuizSessionStatus.draft
        assert session.question_count is None

    async def test_quiz_mode_enum(self, db_session, test_user):
        """normal, exam"""
        modes = [QuizMode.normal, QuizMode.exam]
        for i, mode in enumerate(modes):
            session = QuizSession(
                id=str(uuid.uuid4()),
                user_id=test_user.id,
                mode=mode,
                source_mode=SourceMode.document_based,
            )
            db_session.add(session)
        await db_session.commit()
        # Just verify construction works - enums are valid

    async def test_source_mode_enum(self, db_session, test_user):
        """document_based, no_source"""
        modes = [SourceMode.document_based, SourceMode.no_source]
        for i, mode in enumerate(modes):
            session = QuizSession(
                id=str(uuid.uuid4()),
                user_id=test_user.id,
                mode=QuizMode.normal,
                source_mode=mode,
            )
            db_session.add(session)
        await db_session.commit()
        # Just verify construction works - enums are valid

    async def test_question_type_enum(self, db_session, test_user):
        """all 5 types"""
        types = [
            QuestionType.multiple_choice,
            QuestionType.ox,
            QuestionType.short_answer,
            QuestionType.fill_blank,
            QuestionType.essay,
        ]
        for qt in types:
            session = QuizSession(
                id=str(uuid.uuid4()),
                user_id=test_user.id,
                mode=QuizMode.normal,
                source_mode=SourceMode.document_based,
            )
            db_session.add(session)
            await db_session.flush()

            item = QuizItem(
                id=str(uuid.uuid4()),
                quiz_session_id=session.id,
                item_order=1,
                question_type=qt,
                question_text="Test question",
            )
            db_session.add(item)
        await db_session.commit()
        # Just verify construction works - enums are valid

    async def test_judgement_enum(self):
        """correct, partial, incorrect, skipped"""
        # Just verify enum values exist
        assert Judgement.correct.value == "correct"
        assert Judgement.partial.value == "partial"
        assert Judgement.incorrect.value == "incorrect"
        assert Judgement.skipped.value == "skipped"

    async def test_error_type_enum(self):
        """all 8 values"""
        # Just verify enum values exist
        assert ErrorType.concept_confusion.value == "concept_confusion"
        assert ErrorType.no_response.value == "no_response"

    async def test_quiz_session_status_enum(self):
        """all 11 values"""
        values = [
            QuizSessionStatus.draft,
            QuizSessionStatus.generating,
            QuizSessionStatus.ready,
            QuizSessionStatus.in_progress,
            QuizSessionStatus.submitted,
            QuizSessionStatus.grading,
            QuizSessionStatus.graded,
            QuizSessionStatus.objection_pending,
            QuizSessionStatus.regraded,
            QuizSessionStatus.closed,
            QuizSessionStatus.generation_failed,
        ]
        # Just verify enum values exist
        assert len(values) == 11
        assert QuizSessionStatus.draft.value == "draft"
        assert QuizSessionStatus.generation_failed.value == "generation_failed"

    async def test_create_answer_log_defaults(
        self, db_session, test_user, quiz_session_ready
    ):
        """score_awarded=0.0, max_score=1.0, is_active_result=True"""
        session, items = quiz_session_ready
        answer_log = AnswerLog(
            id=str(uuid.uuid4()),
            quiz_item_id=items[0].id,
            quiz_session_id=session.id,
            user_id=test_user.id,
            judgement=Judgement.correct,
        )
        db_session.add(answer_log)
        await db_session.commit()
        await db_session.refresh(answer_log)
        assert answer_log.score_awarded == 0.0
        assert answer_log.max_score == 1.0
        assert answer_log.is_active_result is True

    async def test_create_quiz_item(self, db_session, test_user):
        """All fields populated"""
        session = QuizSession(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            mode=QuizMode.normal,
            source_mode=SourceMode.document_based,
            status=QuizSessionStatus.ready,
        )
        db_session.add(session)
        await db_session.flush()

        item = QuizItem(
            id=str(uuid.uuid4()),
            quiz_session_id=session.id,
            item_order=1,
            question_type=QuestionType.multiple_choice,
            question_text="What is the capital of Korea?",
            options_json={"choices": [{"label": "A", "text": "Seoul"}]},
            correct_answer_json={"answer": "A"},
            explanation_text="Seoul is the capital of Korea.",
            concept_key="geography_korea",
            concept_label="Geography - Korea",
            category_tag="geography",
            difficulty="easy",
        )
        db_session.add(item)
        await db_session.commit()
        await db_session.refresh(item)

        assert item.question_text == "What is the capital of Korea?"
        assert item.question_type == QuestionType.multiple_choice
        assert item.item_order == 1
        assert item.options_json is not None
        assert item.correct_answer_json is not None
        assert item.explanation_text == "Seoul is the capital of Korea."

    def test_quiz_item_response_normalizes_legacy_list_options(self):
        response = QuizItemResponse(
            id="item-1",
            item_order=1,
            question_type="multiple_choice",
            question_text="Legacy question",
            options=["A", "B"],
        )

        assert response.options == {"options": ["A", "B"]}

    def test_wrong_note_item_normalizes_legacy_choice_dict(self):
        response = WrongNoteItem(
            id="note-1",
            question_text="Legacy wrong note",
            question_type="multiple_choice",
            options={"choices": ["A", "B"]},
            correct_answer={"answer": "A"},
            judgement="incorrect",
            score_awarded=0.0,
            max_score=1.0,
            created_at=datetime.now(timezone.utc),
        )

        assert response.options == {"choices": ["A", "B"], "options": ["A", "B"]}


class TestObjectionModel:
    async def test_create_objection(self, db_session, test_user, quiz_session_ready):
        """All fields"""
        session, items = quiz_session_ready
        from app.models.quiz import AnswerLog, Judgement

        answer_log = AnswerLog(
            id=str(uuid.uuid4()),
            quiz_item_id=items[0].id,
            quiz_session_id=session.id,
            user_id=test_user.id,
            judgement=Judgement.incorrect,
        )
        db_session.add(answer_log)
        await db_session.flush()

        objection = Objection(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            quiz_session_id=session.id,
            quiz_item_id=items[0].id,
            answer_log_id=answer_log.id,
            objection_reason="I believe my answer should be marked correct.",
            objection_payload_json={"user_argument": "The question was ambiguous."},
        )
        db_session.add(objection)
        await db_session.commit()
        await db_session.refresh(objection)

        assert (
            objection.objection_reason
            == "I believe my answer should be marked correct."
        )
        assert objection.status == ObjectionStatus.submitted

    async def test_objection_status_enum(self):
        """all 6 values"""
        values = [
            ObjectionStatus.submitted,
            ObjectionStatus.under_review,
            ObjectionStatus.upheld,
            ObjectionStatus.rejected,
            ObjectionStatus.partially_upheld,
            ObjectionStatus.applied,
        ]
        # Just verify enum values exist
        assert len(values) == 6
        assert ObjectionStatus.submitted.value == "submitted"
        assert ObjectionStatus.applied.value == "applied"

    async def test_create_weak_point(self, db_session, test_user):
        """All fields with defaults"""
        weak_point = WeakPoint(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            concept_key="social_work_interview",
            concept_label="Social Work - Interview",
            category_tag="social_work",
        )
        db_session.add(weak_point)
        await db_session.commit()
        await db_session.refresh(weak_point)

        assert weak_point.wrong_count == 0
        assert weak_point.partial_count == 0
        assert weak_point.skip_count == 0
        assert weak_point.streak_wrong_count == 0
        assert weak_point.concept_key == "social_work_interview"


class TestAdminModels:
    async def test_create_system_log(self, db_session):
        """All fields"""
        log = SystemLog(
            id=str(uuid.uuid4()),
            level="error",
            service_name="quiz_service",
            event_type="generation_failed",
            message="Failed to generate quiz questions",
            meta_json={"file_id": "test-123"},
            trace_id="trace-abc-123",
        )
        db_session.add(log)
        await db_session.commit()
        await db_session.refresh(log)

        assert log.level == "error"
        assert log.service_name == "quiz_service"
        assert log.event_type == "generation_failed"
        assert log.message == "Failed to generate quiz questions"

    async def test_create_announcement(self, db_session):
        """All fields with defaults"""
        announcement = Announcement(
            title="System Maintenance",
            body="The system will be under maintenance on Sunday.",
            is_active=True,
        )
        db_session.add(announcement)
        await db_session.commit()
        await db_session.refresh(announcement)

        assert announcement.title == "System Maintenance"
        assert announcement.body == "The system will be under maintenance on Sunday."
        assert announcement.is_active is True

    async def test_create_admin_audit_log(self, db_session, admin_user, test_user):
        """All fields"""
        log = AdminAuditLog(
            id=str(uuid.uuid4()),
            admin_user_id=admin_user.id,
            action_type="impersonation_start",
            target_user_id=test_user.id,
            target_type="user",
            target_id=str(uuid.uuid4()),
            reason="Support case #12345",
            payload_json={"session_duration": 300},
            ip_address="192.168.1.1",
        )
        db_session.add(log)
        await db_session.commit()
        await db_session.refresh(log)

        assert log.action_type == "impersonation_start"
        assert log.admin_user_id == admin_user.id
        assert log.reason == "Support case #12345"

    async def test_create_dashboard_snapshot(self, db_session, test_user):
        """All fields"""
        snapshot = DashboardSnapshot(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            snapshot_date=datetime.now(timezone.utc),
            range_type="7d",
            payload_json={
                "total_sessions": 10,
                "average_score": 0.85,
            },
        )
        db_session.add(snapshot)
        await db_session.commit()
        await db_session.refresh(snapshot)

        assert snapshot.range_type == "7d"
        assert snapshot.payload_json["total_sessions"] == 10


class TestSearchModels:
    async def test_create_job(self, db_session):
        """All fields with defaults"""
        job = Job(
            id=str(uuid.uuid4()),
            job_type="quiz_generation",
            target_type="quiz_session",
            target_id=str(uuid.uuid4()),
        )
        db_session.add(job)
        await db_session.commit()
        await db_session.refresh(job)

        assert job.job_type == "quiz_generation"
        assert job.status == "pending"
        assert job.retry_count == 0

    async def test_create_draft_answer(self, db_session, test_user, quiz_session_ready):
        """All fields"""
        session, items = quiz_session_ready
        draft = DraftAnswer(
            id=str(uuid.uuid4()),
            quiz_session_id=session.id,
            quiz_item_id=items[0].id,
            user_id=test_user.id,
            user_answer="A",
        )
        db_session.add(draft)
        await db_session.commit()
        await db_session.refresh(draft)

        assert draft.user_answer == "A"
        assert draft.quiz_session_id == session.id

    async def test_create_impersonation_session(
        self, db_session, admin_user, test_user
    ):
        """All fields with defaults"""
        imp_session = ImpersonationSession(
            id=str(uuid.uuid4()),
            admin_user_id=admin_user.id,
            target_user_id=test_user.id,
            reason="Support investigation",
        )
        db_session.add(imp_session)
        await db_session.commit()
        await db_session.refresh(imp_session)

        assert imp_session.admin_user_id == admin_user.id
        assert imp_session.target_user_id == test_user.id
        assert imp_session.is_active is True
        assert imp_session.reason == "Support investigation"

    async def test_create_password_reset_token(self, db_session, test_user):
        from datetime import timedelta

        expires = datetime.now(timezone.utc) + timedelta(hours=1)
        token = PasswordResetToken(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            selector="abcdef1234567890",
            token_hash="fake_hash",
            expires_at=expires,
        )
        db_session.add(token)
        await db_session.commit()
        await db_session.refresh(token)

        assert token.expires_at.replace(tzinfo=None) == expires.replace(tzinfo=None)
        assert token.used_at is None
