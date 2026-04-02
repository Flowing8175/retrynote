from pydantic import BaseModel, ConfigDict, field_validator
from datetime import datetime

from app.schemas._normalizers import normalize_options_payload


class QuizSessionCreate(BaseModel):
    mode: str  # normal | exam
    selected_file_ids: list[str] = []
    manual_text: str | None = None
    question_count: int = 5
    difficulty: str | None = None
    question_types: list[str] = []
    generation_priority: str | None = None
    source_mode: str  # document_based | no_source
    idempotency_key: str | None = None


class QuizSessionResponse(BaseModel):
    quiz_session_id: str
    status: str
    job_id: str | None = None


class QuizSessionDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    mode: str
    source_mode: str
    status: str
    difficulty: str | None
    question_count: int
    generation_model_name: str | None
    grading_model_name: str | None
    started_at: datetime | None
    submitted_at: datetime | None
    graded_at: datetime | None
    total_score: float | None
    max_score: float | None
    items_count: int = 0
    created_at: datetime


class QuizSessionHistoryItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    mode: str
    source_mode: str
    status: str
    question_count: int
    difficulty: str | None
    total_score: float | None
    max_score: float | None
    created_at: datetime


class QuizItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    item_order: int
    question_type: str
    question_text: str
    options: dict | list | None = None
    difficulty: str | None = None
    concept_label: str | None = None
    category_tag: str | None = None

    @field_validator("options", mode="before")
    @classmethod
    def _normalize_options(cls, value):
        return normalize_options_payload(value)


class QuizItemDetail(QuizItemResponse):
    correct_answer: dict | None = None
    explanation: str | None = None
    source_refs: dict | None = None


class AnswerSubmit(BaseModel):
    user_answer: str


class AnswerResponse(BaseModel):
    answer_log_id: str
    judgement: str
    score_awarded: float
    max_score: float
    grading_confidence: float | None
    grading_rationale: str | None
    missing_points: dict | None = None
    error_type: str | None = None
    normalized_user_answer: str | None
    suggested_feedback: str | None = None
    next_item_id: str | None = None


class DraftAnswerSubmit(BaseModel):
    item_id: str
    user_answer: str


class DraftAnswerResponse(BaseModel):
    saved_at: datetime


class ExamSubmit(BaseModel):
    idempotency_key: str


class ExamSubmitResponse(BaseModel):
    status: str
    job_id: str | None = None
