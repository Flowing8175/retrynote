from pydantic import BaseModel, ConfigDict, Field
from datetime import datetime


class ObjectionCreate(BaseModel):
    answer_log_id: str = Field(max_length=36)
    objection_reason: str = Field(min_length=1, max_length=5000)


class ObjectionResponse(BaseModel):
    objection_id: str
    status: str


class ObjectionDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    quiz_session_id: str
    quiz_item_id: str
    answer_log_id: str
    objection_reason: str
    status: str
    review_result: dict | None = None
    decided_at: datetime | None = None
    decided_by: str | None = None
    created_at: datetime
