from pydantic import BaseModel
from datetime import datetime


class RetrySetCreate(BaseModel):
    source: str  # wrong_notes | dashboard_recommendation | concept_manual
    concept_keys: list[str] | None = None
    size: int = 5


class RetrySetResponse(BaseModel):
    quiz_session_id: str
    job_id: str
