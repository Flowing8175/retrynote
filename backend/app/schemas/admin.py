from typing import Literal
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from datetime import datetime


class MasterPasswordVerify(BaseModel):
    master_password: str = Field(min_length=1, max_length=255)


class AdminUserItem(BaseModel):
    id: str
    username: str
    email: str
    created_at: datetime
    storage_used_bytes: int
    last_login_at: datetime | None = None
    is_active: bool
    role: str | None = None


class AdminUserStatusUpdate(BaseModel):
    is_active: bool


class AdminUserRoleUpdate(BaseModel):
    new_role: Literal["user", "admin", "super_admin"]


class AdminUserListResponse(BaseModel):
    users: list[AdminUserItem]
    total: int


class AdminLogQuery(BaseModel):
    page: int = 1
    size: int = 20
    level: str | None = None
    service_name: str | None = None
    event_type: str | None = None
    date_from: datetime | None = None
    date_to: datetime | None = None


class AdminLogItem(BaseModel):
    id: str
    level: str
    service_name: str
    event_type: str
    message: str
    meta_json: dict | None = None
    trace_id: str | None = None
    created_at: datetime


class AdminLogResponse(BaseModel):
    logs: list[AdminLogItem]
    total: int


class ModelUsageItem(BaseModel):
    model_name: str
    request_count: int
    input_tokens: int
    output_tokens: int
    failure_count: int
    fallback_count: int


class ModelUsageResponse(BaseModel):
    usage: list[ModelUsageItem]


class ImpersonationStart(BaseModel):
    target_user_id: str = Field(max_length=36)
    reason: str = Field(min_length=1, max_length=1000)


class ImpersonationResponse(BaseModel):
    impersonation_id: str
    target_user_id: str
    target_username: str


class RegradeRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=1000)


class RegradeResponse(BaseModel):
    regrade_job_id: str


class ModelSettingsUpdate(BaseModel):
    active_generation_model: str | None = Field(default=None, max_length=100)
    active_grading_model: str | None = Field(default=None, max_length=100)
    fallback_generation_model: str | None = Field(default=None, max_length=100)
    fallback_grading_model: str | None = Field(default=None, max_length=100)


class AnnouncementCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1, max_length=5000)
    is_active: bool = False
    starts_at: datetime | None = None
    ends_at: datetime | None = None


class AnnouncementResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    body: str
    is_active: bool
    starts_at: datetime | None
    ends_at: datetime | None
    created_at: datetime


class AdminAuditLogItem(BaseModel):
    id: str
    admin_user_id: str
    target_user_id: str | None
    action_type: str
    target_type: str | None
    target_id: str | None
    reason: str | None
    payload_json: dict | None
    ip_address: str | None
    created_at: datetime


class SystemHealthComponent(BaseModel):
    status: str
    latency_ms: float | None = None
    detail: str | None = None


class SystemHealthResponse(BaseModel):
    status: str
    checked_at: datetime
    components: dict[str, SystemHealthComponent]
    stats: dict[str, int | float]


class TopStorageUser(BaseModel):
    username: str
    storage_used_bytes: int


class TopErrorItem(BaseModel):
    event_type: str
    count: int


class JobQueueItem(BaseModel):
    status: str
    job_type: str
    count: int


class AdminDashboardKPIs(BaseModel):
    quizzes_today: int
    total_quiz_jobs: int
    total_storage_bytes: int
    ai_token_usage_24h: int
    signups_7d: int
    dau: int
    top_users_by_storage: list[TopStorageUser]
    top_errors_24h: list[TopErrorItem]
    job_queue: list[JobQueueItem]


class AdminJobItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    job_type: str
    status: str
    target_type: str | None = None
    target_id: str | None = None
    payload_json: dict | None = None
    result_json: dict | None = None
    error_message: str | None = None
    retry_count: int
    created_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None
    celery_task_id: str | None = None


class AdminJobListResponse(BaseModel):
    jobs: list[AdminJobItem]
    total: int


class AdminDbTableInfo(BaseModel):
    name: str
    row_estimate: int
    total_size: str


class AdminDbDiagnostics(BaseModel):
    tables: list[AdminDbTableInfo]
    migration_version: str | None
    db_total_size: str
    checked_at: datetime


class AdminFileStatusBreakdown(BaseModel):
    status: str
    count: int


class AdminFileInProgress(BaseModel):
    id: str
    original_filename: str | None
    status: str
    user_id: str
    username: str
    processing_started_at: datetime | None
    retry_count: int


class AdminFileFailure(BaseModel):
    id: str
    original_filename: str | None
    status: str
    user_id: str
    username: str
    parse_error_code: str | None
    processing_finished_at: datetime | None


class AdminFilePipelineResponse(BaseModel):
    status_breakdown: list[AdminFileStatusBreakdown]
    in_progress: list[AdminFileInProgress]
    recent_failures: list[AdminFileFailure]


class AdminRateLimitEvent(BaseModel):
    client_ip: str
    path: str
    event_count: int
    latest_event: datetime


class AdminRateLimitTopPath(BaseModel):
    path: str
    count: int


class AdminRateLimitResponse(BaseModel):
    events: list[AdminRateLimitEvent]
    total_events_24h: int
    unique_ips_count: int
    top_paths: list[AdminRateLimitTopPath]
