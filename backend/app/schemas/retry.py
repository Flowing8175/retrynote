from pydantic import BaseModel, Field, field_validator
from typing import Literal


class RetrySetCreate(BaseModel):
    source: Literal[
        "wrong_notes", "dashboard_recommendation", "concept_manual", "quiz_session"
    ]
    concept_keys: list[str] | None = Field(default=None, max_length=50)
    size: int | None = Field(default=5, ge=1, le=50)
    quiz_session_id: str | None = None

    mode: Literal["normal", "exam"] = "normal"
    difficulty: str | None = Field(default=None, max_length=50)
    question_types: list[str] = Field(default=[], max_length=10)
    preferred_model: str | None = Field(default=None, max_length=100)
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


class RetrySetResponse(BaseModel):
    quiz_session_id: str
    job_id: str
