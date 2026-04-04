from pydantic import BaseModel, ConfigDict, Field, field_validator
from datetime import datetime
from typing import Literal

from app.schemas._normalizers import normalize_options_payload


class QuizSessionCreate(BaseModel):
    mode: Literal["normal", "exam"]
    selected_file_ids: list[str] = Field(default=[], max_length=50)
    manual_text: str | None = Field(default=None, max_length=50000)
    question_count: int | None = Field(default=None)
    difficulty: str | None = Field(default=None, max_length=50)
    question_types: list[str] = Field(default=[], max_length=10)
    generation_priority: str | None = Field(default=None, max_length=50)
    preferred_model: Literal["gpt-4.1-mini", "gpt-5.4-mini", "gpt-4.1"] | None = None
    source_mode: Literal["document_based", "no_source"]
    topic: str | None = Field(default=None, max_length=200)
    idempotency_key: str | None = Field(default=None, max_length=255)


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
    question_count: int | None
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
    question_count: int | None
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
    tips: str | None = None
    source_refs: dict | None = None


class AnswerSubmit(BaseModel):
    user_answer: str = Field(max_length=10000)


class AnswerResponse(BaseModel):
    answer_log_id: str
    judgement: str
    score_awarded: float
    max_score: float
    grading_confidence: float | None
    grading_rationale: str | None
    explanation: str | None = None
    tips: str | None = None
    missing_points: list[str] | None = None
    error_type: str | None = None
    normalized_user_answer: str | None
    suggested_feedback: str | None = None
    next_item_id: str | None = None
    correct_answer: dict | None = None


class DraftAnswerSubmit(BaseModel):
    item_id: str = Field(max_length=36)
    user_answer: str = Field(max_length=10000)


class DraftAnswerResponse(BaseModel):
    saved_at: datetime


class ExamSubmit(BaseModel):
    idempotency_key: str = Field(max_length=255)


class ExamSubmitResponse(BaseModel):
    status: str
    job_id: str | None = None


class AnswerLogEntry(BaseModel):
    item_id: str
    answer_log_id: str
    user_answer: str
    judgement: str
    score_awarded: float
    max_score: float
    grading_confidence: float | None = None
    grading_rationale: str | None = None
    explanation: str | None = None
    tips: str | None = None
    missing_points: list[str] | None = None
    error_type: str | None = None
    normalized_user_answer: str | None = None
    suggested_feedback: str | None = None
    correct_answer: dict | None = None
