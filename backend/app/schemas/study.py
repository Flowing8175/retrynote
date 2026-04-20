from pydantic import BaseModel, ConfigDict, Field
from datetime import datetime
from typing import Literal

StudyItemType = Literal["mcq", "ox", "cloze", "short_answer", "flashcard"]
StudyDifficulty = Literal["easy", "medium", "hard", "mixed"]
StudyLanguage = Literal["auto", "ko", "en"]


# ============================================================================
# SUMMARY SCHEMAS
# ============================================================================


class StudySummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    file_id: str
    content: str
    status: str
    generated_at: datetime | None = None


# ============================================================================
# FLASHCARD SCHEMAS
# ============================================================================


class StudyFlashcardResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    front: str
    back: str
    order: int


class StudyFlashcardSetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    file_id: str
    status: str
    cards: list[StudyFlashcardResponse] = []
    generated_at: datetime | None = None


# ============================================================================
# MINDMAP SCHEMAS
# ============================================================================


class StudyMindmapNode(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    label: str
    type: str | None = None
    position: dict


class StudyMindmapEdge(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    source: str
    target: str


class StudyMindmapResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    file_id: str
    data: dict
    status: str
    generated_at: datetime | None = None


class MindmapNodeExplanationRequest(BaseModel):
    node_id: str = Field(max_length=64)
    node_label: str = Field(max_length=200)


class MindmapNodeExplanationResponse(BaseModel):
    node_id: str
    node_label: str
    explanation: str
    cached: bool = False


# ============================================================================
# CHAT SCHEMAS
# ============================================================================


class StudyChatRequest(BaseModel):
    message: str = Field(max_length=10000)
    page_context: int | None = None


class StudyChatMessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    role: str
    content: str
    page_context: int | None = None
    created_at: datetime


class StudyChatHistoryResponse(BaseModel):
    messages: list[StudyChatMessageResponse]


# ============================================================================
# GENERATION & STATUS SCHEMAS
# ============================================================================


class GenerateRequest(BaseModel):
    force_regenerate: bool = False


class StudyStatusResponse(BaseModel):
    file_id: str
    filename: str | None = None
    file_type: str | None = None
    file_status: str | None = None
    is_short_document: bool = False
    summary_status: str
    flashcards_status: str
    mindmap_status: str


# ============================================================================
# VISIT / HISTORY SCHEMAS
# ============================================================================


class StudyVisitResponse(BaseModel):
    status: str
    last_visited_at: datetime
    visit_count: int


class StudyHistoryItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    file_id: str
    original_filename: str | None = None
    file_type: str | None = None
    file_size_bytes: int
    source_type: str
    status: str
    folder_id: str | None = None
    last_visited_at: datetime
    visit_count: int


class StudyHistoryResponse(BaseModel):
    items: list[StudyHistoryItem]
    total: int


# ============================================================================
# STUDY ITEM SCHEMAS (MCQ / OX / Cloze / Short Answer / Flashcard)
# ============================================================================


class StudyItemOption(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    label: str
    text: str
    correct: bool
    misconception_targeted: str | None = None


class StudyItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    order: int
    item_type: StudyItemType
    front: str
    back: str | None = None
    options: list[StudyItemOption] | None = None
    correct_answer: str | None = None
    acceptable_answers: list[str] | None = None
    key_points: list[str] | None = None
    bloom_level: str | None = None
    difficulty: str | None = None
    source_span: str | None = None
    explanation: str | None = None


class StudyItemSetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    file_id: str
    item_type: StudyItemType
    difficulty: StudyDifficulty
    count_requested: int
    language: StudyLanguage
    status: str
    error_code: str | None = None
    error_message: str | None = None
    model_used: str | None = None
    generated_at: datetime | None = None
    items: list[StudyItemResponse] = []


class StudyItemGenerateRequest(BaseModel):
    item_type: StudyItemType
    difficulty: StudyDifficulty = "medium"
    count: int = Field(5, ge=1, le=30)
    language: StudyLanguage = "auto"
    force_regenerate: bool = False
