from typing import Literal
from pydantic import BaseModel, Field


class DashboardResponse(BaseModel):
    overall_accuracy: float
    score_rate: float
    learning_volume: int
    weak_concepts: list[dict]
    accuracy_by_type: list[dict]
    accuracy_by_subject: list[dict]
    accuracy_by_file: list[dict]
    retry_recommendations: list[dict]
    recent_wrong_notes: list[dict]
    coaching_summary: str | None = None


class DashboardQuery(BaseModel):
    range: Literal["7d", "30d", "all"] = "7d"
    file_id: str | None = Field(default=None, max_length=36)
    category_tag: str | None = Field(default=None, max_length=100)
