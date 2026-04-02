from pydantic import BaseModel
from datetime import datetime


class SearchQuery(BaseModel):
    q: str
    scope: str = "all"  # all | files | wrong_notes | quiz_history
    file_id: str | None = None
    folder_id: str | None = None
    page: int = 1
    size: int = 20


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
