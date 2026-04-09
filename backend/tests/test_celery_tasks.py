import asyncio
from functools import partial
from unittest.mock import patch, MagicMock, AsyncMock
import logging


import app.workers.celery_app as celery_module


def _reset_worker_loop():
    if (
        celery_module._worker_event_loop is not None
        and not celery_module._worker_event_loop.is_closed()
    ):
        celery_module._worker_event_loop.close()
    celery_module._worker_event_loop = None


class TestGetWorkerEventLoop:
    def setup_method(self):
        _reset_worker_loop()

    def teardown_method(self):
        _reset_worker_loop()

    def test_returns_event_loop_and_same_on_second_call(self):
        loop1 = celery_module._get_worker_event_loop()
        loop2 = celery_module._get_worker_event_loop()
        assert isinstance(loop1, asyncio.AbstractEventLoop)
        assert loop1 is loop2

    def test_returns_new_loop_if_previous_closed(self):
        loop1 = celery_module._get_worker_event_loop()
        loop1.close()
        loop2 = celery_module._get_worker_event_loop()
        assert loop2 is not loop1
        assert not loop2.is_closed()


class TestCeleryAppConfiguration:
    def test_serializer_is_json(self):
        assert celery_module.celery_app.conf.task_serializer == "json"

    def test_accept_content_json(self):
        assert "json" in celery_module.celery_app.conf.accept_content

    def test_result_serializer_json(self):
        assert celery_module.celery_app.conf.result_serializer == "json"

    def test_timezone_asia_seoul(self):
        assert celery_module.celery_app.conf.timezone == "Asia/Seoul"

    def test_enable_utc(self):
        assert celery_module.celery_app.conf.enable_utc is True

    def test_task_acks_late(self):
        assert celery_module.celery_app.conf.task_acks_late is True


class TestProcessFileTask:
    def test_calls_run_async_task_with_process_file(self):
        with (
            patch.object(celery_module, "_run_async_task") as mock_run,
            patch(
                "app.services.quiz_service.process_file", new_callable=MagicMock
            ) as mock_pf,
        ):
            sentinel = MagicMock()
            mock_pf.return_value = sentinel
            celery_module.process_file_task("job-123")
            mock_run.assert_called_once_with(sentinel)


class TestGenerateQuizTask:
    def test_calls_run_async_task_with_generate_quiz(self):
        with (
            patch.object(celery_module, "_run_async_task") as mock_run,
            patch(
                "app.services.quiz_service.generate_quiz", new_callable=MagicMock
            ) as mock_gq,
        ):
            sentinel = MagicMock()
            mock_gq.return_value = sentinel
            celery_module.generate_quiz_task("job-456")
            mock_run.assert_called_once_with(sentinel)


class TestGradeExamTask:
    def test_calls_run_async_task_with_grade_exam(self):
        with (
            patch.object(celery_module, "_run_async_task") as mock_run,
            patch(
                "app.services.quiz_service.grade_exam", new_callable=MagicMock
            ) as mock_ge,
        ):
            sentinel = MagicMock()
            mock_ge.return_value = sentinel
            celery_module.grade_exam_task("job-789")
            mock_run.assert_called_once_with(sentinel)


class TestReviewObjectionTask:
    def test_calls_run_async_task_with_review_objection(self):
        with (
            patch.object(celery_module, "_run_async_task") as mock_run,
            patch(
                "app.services.quiz_service.review_objection", new_callable=MagicMock
            ) as mock_ro,
        ):
            sentinel = MagicMock()
            mock_ro.return_value = sentinel
            celery_module.review_objection_task("job-abc")
            mock_run.assert_called_once_with(sentinel)


class TestFileCleanupTask:
    def setup_method(self):
        _reset_worker_loop()

    def teardown_method(self):
        _reset_worker_loop()

    def test_job_not_found_logs_error(self, caplog):
        mock_job_result = MagicMock()
        mock_job_result.scalar_one_or_none.return_value = None

        mock_session = AsyncMock()
        mock_session.execute.return_value = mock_job_result
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=False)

        mock_session_factory = MagicMock(return_value=mock_session)

        with patch("app.database.async_session", mock_session_factory):
            with caplog.at_level(logging.ERROR, logger="app.workers.celery_app"):
                celery_module.file_cleanup_task("nonexistent-job")

        assert any("not found" in rec.message for rec in caplog.records)

    def test_file_not_found_sets_job_failed(self):
        mock_job = MagicMock()
        mock_job.target_id = "file-999"

        mock_job_result = MagicMock()
        mock_job_result.scalar_one_or_none.return_value = mock_job

        mock_file_result = MagicMock()
        mock_file_result.scalar_one_or_none.return_value = None

        mock_session = AsyncMock()
        mock_session.execute.side_effect = [mock_job_result, mock_file_result]
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=False)

        mock_session_factory = MagicMock(return_value=mock_session)

        with patch("app.database.async_session", mock_session_factory):
            celery_module.file_cleanup_task("job-with-missing-file")
            assert mock_job.status == "failed"
            mock_session.commit.assert_called()


class TestDispatchTask:
    def test_calls_send_task_via_run_in_executor(self):
        async def _real_dispatch(task_name, args):
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None, partial(celery_module.celery_app.send_task, task_name, args)
            )

        mock_send = MagicMock()
        original_send = celery_module.celery_app.send_task
        celery_module.celery_app.send_task = mock_send
        try:
            loop = asyncio.new_event_loop()
            try:
                loop.run_until_complete(_real_dispatch("test_task", ["arg1"]))
                mock_send.assert_called_once_with("test_task", ["arg1"])
            finally:
                loop.close()
        finally:
            celery_module.celery_app.send_task = original_send
