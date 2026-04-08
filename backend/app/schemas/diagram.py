from pydantic import BaseModel, ConfigDict
from datetime import datetime


class DiagramGenerateRequest(BaseModel):
    concept_key: str
    force: bool = False


class DiagramResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    concept_key: str
    concept_label: str
    diagram_type: str
    mermaid_code: str
    title: str
    cached: bool = False
    created_at: datetime | None = None
