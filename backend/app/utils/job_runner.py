from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession


class JobFailure(Exception):
    pass


class JobRunner:
    """Async context manager for job status lifecycle.

    Entry: job.status="processing", job.started_at=now(), commit.
    Clean exit: if status still "processing" → "completed", finished_at, commit.
    JobFailure: "failed", error_message, finished_at, commit — exception suppressed.
    Other exception: same writes, exception re-raised.
    """

    def __init__(self, db: AsyncSession, job: Any) -> None:
        self.db = db
        self.job = job

    async def __aenter__(self) -> "JobRunner":
        self.job.status = "processing"
        self.job.started_at = datetime.now(timezone.utc)
        await self.db.commit()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):  # type: ignore[override]
        now = datetime.now(timezone.utc)

        if exc_type is None:
            if self.job.status == "processing":
                self.job.status = "completed"
                self.job.finished_at = now
                await self.db.commit()
            return False

        self.job.status = "failed"
        self.job.error_message = str(exc_val)
        self.job.finished_at = now
        await self.db.commit()
        return issubclass(exc_type, JobFailure)
