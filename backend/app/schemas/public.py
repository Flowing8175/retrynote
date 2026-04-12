from pydantic import BaseModel, Field
from datetime import datetime


class PublicQuizSessionCreate(BaseModel):
    topic: str | None = Field(default=None, max_length=200)
    manual_text: str | None = Field(default=None, max_length=50000)
    selected_file_ids: list[str] = Field(default=[], max_length=3)
    question_count: int = Field(default=5, ge=3, le=5)
    difficulty: str | None = Field(default=None, max_length=50)


class PublicQuizSessionResponse(BaseModel):
    session_id: str
    status: str


class PublicQuizSessionDetail(BaseModel):
    session_id: str
    status: str
    question_count: int | None
    created_at: datetime


class PublicQuizItemResponse(BaseModel):
    id: str
    item_order: int
    question_type: str
    question_text: str
    options_json: dict | None = None
    option_descriptions_json: dict | None = None
    difficulty: str | None = None


class PublicAnswerSubmit(BaseModel):
    user_answer: str


class PublicAnswerResponse(BaseModel):
    is_correct: bool
    score: float
    max_score: float
    rationale: str | None = None
    correct_answer: str
    explanation: str | None = None
    judgement: str
    error_type: str | None = None


class PublicQuizResultItem(BaseModel):
    id: str
    item_order: int
    question_type: str
    question_text: str
    options_json: dict | None = None
    correct_answer_json: dict | None = None
    explanation_text: str | None = None
    user_answer: str | None = None
    judgement: str
    score_awarded: float
    max_score: float
    grading_rationale: str | None = None


class PublicQuizResults(BaseModel):
    session_id: str
    total_score: float
    max_score: float
    items: list[PublicQuizResultItem]
