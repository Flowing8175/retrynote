from pydantic import BaseModel
from datetime import datetime


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
    range: str = "7d"  # 7d | 30d | all
    file_id: str | None = None
    category_tag: str | None = None
