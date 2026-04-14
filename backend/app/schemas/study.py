from pydantic import BaseModel, ConfigDict, Field
from datetime import datetime


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
    summary_status: str
    flashcards_status: str
    mindmap_status: str
