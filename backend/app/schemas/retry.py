from pydantic import BaseModel, Field
from typing import Literal
from datetime import datetime


class RetrySetCreate(BaseModel):
    source: Literal["wrong_notes", "dashboard_recommendation", "concept_manual"]
    concept_keys: list[str] | None = Field(default=None, max_length=50)
    size: int | None = Field(default=None, ge=1, le=50)


class RetrySetResponse(BaseModel):
    quiz_session_id: str
    job_id: str
