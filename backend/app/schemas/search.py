from typing import Literal
from pydantic import BaseModel, Field


class SearchQuery(BaseModel):
    q: str = Field(min_length=1, max_length=500)
    scope: Literal["all", "files", "wrong_notes", "quiz_history"] = "all"
    file_id: str | None = Field(default=None, max_length=36)
    folder_id: str | None = Field(default=None, max_length=36)
    page: int = Field(default=1, ge=1, le=1000)
    size: int = Field(default=20, ge=1, le=100)


class SearchResultItem(BaseModel):
    result_type: str  # file | wrong_note | quiz_item
    title: str
    snippet: str | None = None
    highlight: str | None = None
    source_id: str
    source_metadata: dict | None = None
    relevance_score: float | None = None


class SearchResponse(BaseModel):
    results: list[SearchResultItem]
    total: int
    page: int
    size: int
