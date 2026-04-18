from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class SavedPromptCreate(BaseModel):
    content: str = Field(min_length=1, max_length=2000)


class SavedPromptUpsert(BaseModel):
    content: str = Field(min_length=1, max_length=2000)


class SavedPromptResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    slot: int
    content: str
    created_at: datetime
    updated_at: datetime
