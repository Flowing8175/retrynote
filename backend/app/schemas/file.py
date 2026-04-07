from pydantic import BaseModel, ConfigDict
from datetime import datetime


class FileUploadResponse(BaseModel):
    file_id: str
    status: str
    job_id: str | None = None


class FileDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    original_filename: str | None
    file_type: str | None
    file_size_bytes: int
    source_type: str
    source_url: str | None
    status: str
    parse_error_code: str | None
    ocr_required: bool
    retry_count: int
    is_searchable: bool
    is_quiz_eligible: bool
    processing_started_at: datetime | None
    processing_finished_at: datetime | None
    folder_id: str | None
    created_at: datetime


class FolderDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    parent_folder_id: str | None
    sort_order: int
    status: str
    created_at: datetime


class FileListResponse(BaseModel):
    files: list[FileDetail]
    total: int
    page: int
    size: int


class FileRetryResponse(BaseModel):
    job_id: str
    status: str
