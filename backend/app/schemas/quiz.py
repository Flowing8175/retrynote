from pydantic import BaseModel, ConfigDict, Field, field_validator
from datetime import datetime
from typing import Literal

from app.schemas._normalizers import normalize_options_payload


class QuizSessionCreate(BaseModel):
    mode: Literal["normal", "exam"]
    selected_file_ids: list[str] = Field(default=[], max_length=50)
    manual_text: str | None = Field(default=None, max_length=50000)
    question_count: int | None = Field(default=None, ge=1, le=200)
    difficulty: str | None = Field(default=None, max_length=50)
    question_types: list[str] = Field(default=[], max_length=10)
    generation_priority: str | None = Field(default=None, max_length=50)
    preferred_model: str | None = Field(default=None, max_length=100)
    source_mode: Literal["document_based", "no_source"]
    topic: str | None = Field(default=None, max_length=200)
    source_url: str | None = Field(default=None, max_length=2000)
    idempotency_key: str | None = Field(default=None, max_length=255)
    stream: bool = False
    user_instruction: str | None = Field(default=None, max_length=2000)

    @field_validator("user_instruction")
    @classmethod
    def _normalize_user_instruction(cls, value: str | None):
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None

    @field_validator("preferred_model")
    @classmethod
    def _validate_preferred_model(cls, value: str | None):
        if value is None:
            return value

        from app.config import settings as cfg

        allowed_models = {
            model_name
            for model_name in [
                cfg.eco_generation_model,
                cfg.balanced_generation_model,
                cfg.performance_generation_model,
                cfg.max_generation_model,
            ]
            if model_name
        }

        if value not in allowed_models:
            raise ValueError(
                f"preferred_model must be one of the server-configured generation models: {', '.join(sorted(allowed_models))}"
            )

        return value


class QuizConfigResponse(BaseModel):
    default_generation_model: str
    available_generation_models: list[str]
    generation_model_options: list[dict[str, str | bool]]


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
    started_at: datetime | None
    submitted_at: datetime | None
    graded_at: datetime | None
    total_score: float | None
    max_score: float | None
    items_count: int = 0
    created_at: datetime
    error_message: str | None = None
    is_first_quiz_today: bool = False


class QuizSessionHistoryItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str | None
    mode: str
    source_mode: str
    status: str
    question_count: int | None
    difficulty: str | None
    total_score: float | None
    max_score: float | None
    created_at: datetime
    concept_labels: list[str] = []


class QuizItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    item_order: int
    question_type: str
    question_text: str
    options: dict | list | None = None
    option_descriptions: dict | None = None
    difficulty: str | None = None
    concept_key: str | None = None
    concept_label: str | None = None
    category_tag: str | None = None
    correct_answer: dict | None = None
    explanation: str | None = None
    tips: str | None = None

    @field_validator("options", mode="before")
    @classmethod
    def _normalize_options(cls, value):
        return normalize_options_payload(value)


class QuizItemDetail(QuizItemResponse):
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


class DraftAnswerEntry(BaseModel):
    item_id: str
    user_answer: str
    saved_at: datetime


class ExamSubmit(BaseModel):
    idempotency_key: str = Field(max_length=255)


class ExamSubmitResponse(BaseModel):
    status: str
    job_id: str | None = None


class SessionCompleteResponse(BaseModel):
    status: str
    total_score: float
    max_score: float


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


class BatchAnswerItem(BaseModel):
    item_id: str = Field(max_length=36)
    user_answer: str = Field(max_length=10000)


class BatchAnswerSubmit(BaseModel):
    answers: list[BatchAnswerItem] = Field(max_length=200)


class BatchItemResult(BaseModel):
    item_id: str
    answer_log_id: str
    judgement: str
    score_awarded: float
    max_score: float
    grading_confidence: float | None = None
    grading_rationale: str | None = None
    missing_points: list[str] | None = None
    error_type: str | None = None
    suggested_feedback: str | None = None
    correct_answer: dict | None = None
    explanation: str | None = None


class BatchAnswerResponse(BaseModel):
    results: list[BatchItemResult]
    total_score: float
    max_score: float
