from pydantic import BaseModel, ConfigDict, Field, field_validator
from datetime import datetime

from app.models.quiz import ErrorType
from app.schemas._normalizers import (
    normalize_correct_answer_payload,
    normalize_options_payload,
)


class WrongNoteItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    question_text: str
    question_type: str
    options: dict | list | None = None
    correct_answer: dict | None = None
    user_answer_raw: str | None = None
    user_answer_normalized: str | None = None
    judgement: str
    score_awarded: float
    max_score: float
    explanation: str | None = None
    concept_key: str | None = None
    concept_label: str | None = None
    category_tag: str | None = None
    error_type: str | None = None
    missing_points: list[str] | None = None
    graded_at: datetime | None = None
    file_id: str | None = None
    original_filename: str | None = None
    created_at: datetime

    @field_validator("options", mode="before")
    @classmethod
    def _normalize_options(cls, value):
        return normalize_options_payload(value)

    @field_validator("correct_answer", mode="before")
    @classmethod
    def _normalize_correct_answer(cls, value):
        return normalize_correct_answer_payload(value)


class WrongNoteListResponse(BaseModel):
    items: list[WrongNoteItem]
    total: int
    page: int
    size: int


class WrongNoteErrorTypeUpdate(BaseModel):
    error_type: str = Field(max_length=100)

    @field_validator("error_type")
    @classmethod
    def _validate_error_type(cls, v: str) -> str:
        try:
            ErrorType(v)
        except ValueError:
            raise ValueError(f"Invalid error_type '{v}'")
        return v
