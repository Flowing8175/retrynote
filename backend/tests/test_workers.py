import asyncio

import app.workers.celery_app as celery_module


class TestCeleryWorkerEventLoop:
    def test_run_async_task_reuses_same_event_loop(self):
        original_loop = celery_module._worker_event_loop

        if original_loop is not None and not original_loop.is_closed():
            original_loop.close()

        celery_module._worker_event_loop = None

        async def identify_loop(value: int):
            return id(asyncio.get_running_loop()), value

        try:
            first_loop_id, first_value = celery_module._run_async_task(identify_loop(1))
            second_loop_id, second_value = celery_module._run_async_task(
                identify_loop(2)
            )

            assert first_loop_id == second_loop_id
            assert first_value == 1
            assert second_value == 2
        finally:
            loop = celery_module._worker_event_loop
            if loop is not None and not loop.is_closed():
                loop.close()
            celery_module._worker_event_loop = None
