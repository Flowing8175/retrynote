import asyncio
import time
import uuid
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.rate_limit import limiter
from app.models.user import User, UserRole, AdminSettings
from app.models.admin import SystemLog, AdminAuditLog, Announcement
from app.models.file import File, FileStatus
from app.models.quiz import QuizItem, AnswerLog, QuizSession
from app.models.search import ImpersonationSession, Job
from app.schemas.admin import (
    MasterPasswordVerify,
    AdminUserItem,
    AdminUserListResponse,
    AdminLogResponse,
    AdminLogItem,
    ModelUsageResponse,
    ModelUsageItem,
    ImpersonationStart,
    ImpersonationResponse,
    RegradeRequest,
    RegradeResponse,
    ModelSettingsUpdate,
    AnnouncementCreate,
    AnnouncementResponse,
    AdminAuditLogItem,
    SystemHealthComponent,
    SystemHealthResponse,
    AdminDashboardKPIs,
    TopStorageUser,
    TopErrorItem,
    JobQueueItem,
    AdminJobItem,
    AdminJobListResponse,
    AdminDbTableInfo,
    AdminDbDiagnostics,
    AdminFileStatusBreakdown,
    AdminFileInProgress,
    AdminFileFailure,
    AdminFilePipelineResponse,
)
from app.middleware.auth import (
    require_admin,
    require_admin_verified,
    require_super_admin,
    get_current_user,
    hash_password,
    verify_password,
    create_admin_token,
    get_client_ip,
)
from app.workers.celery_app import celery_app, dispatch_task

router = APIRouter()


async def log_audit(
    db: AsyncSession,
    admin_user_id: str,
    action_type: str,
    request: Request,
    target_user_id: str | None = None,
    target_type: str | None = None,
    target_id: str | None = None,
    reason: str | None = None,
    payload: dict | None = None,
):
    log = AdminAuditLog(
        id=str(uuid.uuid4()),
        admin_user_id=admin_user_id,
        target_user_id=target_user_id,
        action_type=action_type,
        target_type=target_type,
        target_id=target_id,
        reason=reason,
        payload_json=payload,
        ip_address=get_client_ip(request),
    )
    db.add(log)
    await db.flush()


@router.post("/login/verify-master")
@limiter.limit("5/minute")
async def verify_master_password(
    req: MasterPasswordVerify,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    settings_result = await db.execute(select(AdminSettings).limit(1))
    admin_settings = settings_result.scalar_one_or_none()
    if not admin_settings:
        admin_settings = AdminSettings(id=str(uuid.uuid4()))
        db.add(admin_settings)
        await db.flush()

    if not admin_settings.master_password_hash:
        if settings.admin_master_password:
            admin_settings.master_password_hash = hash_password(
                settings.admin_master_password
            )
            await db.commit()
        elif user.role.value != "super_admin":
            raise HTTPException(
                status_code=403,
                detail="Only super_admin can set the initial master password",
            )
        else:
            admin_settings.master_password_hash = hash_password(req.master_password)
            await db.commit()
            token = create_admin_token(user.id)
            return {"verified": True, "admin_token": token}

    if verify_password(req.master_password, admin_settings.master_password_hash):
        token = create_admin_token(user.id)
        return {"verified": True, "admin_token": token}

    raise HTTPException(status_code=403, detail="Invalid master password")


@router.get("/users", response_model=AdminUserListResponse)
async def list_users(
    request: Request,
    page: int = 1,
    size: int = 20,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    await log_audit(db, admin.id, "list_users", request)

    result = await db.execute(
        select(User)
        .where(User.deleted_at.is_(None))
        .order_by(User.created_at.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    users = result.scalars().all()

    total_result = await db.execute(
        select(func.count()).select_from(User).where(User.deleted_at.is_(None))
    )
    total = total_result.scalar() or 0

    return AdminUserListResponse(
        users=[
            AdminUserItem(
                id=u.id,
                username=u.username,
                email=u.email,
                created_at=u.created_at,
                storage_used_bytes=u.storage_used_bytes,
                last_login_at=u.last_login_at,
                is_active=u.is_active,
            )
            for u in users
        ],
        total=total,
    )


@router.get("/logs")
async def list_logs(
    request: Request,
    page: int = 1,
    size: int = 20,
    level: str | None = None,
    service_name: str | None = None,
    event_type: str | None = None,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    await log_audit(db, admin.id, "list_logs", request)

    query = select(SystemLog).order_by(SystemLog.created_at.desc())
    if level:
        query = query.where(SystemLog.level == level)
    if service_name:
        query = query.where(SystemLog.service_name == service_name)
    if event_type:
        query = query.where(SystemLog.event_type == event_type)

    total_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = total_result.scalar() or 0

    result = await db.execute(query.offset((page - 1) * size).limit(size))
    logs = result.scalars().all()

    return AdminLogResponse(
        logs=[
            AdminLogItem(
                id=l.id,
                level=l.level,
                service_name=l.service_name,
                event_type=l.event_type,
                message=l.message,
                meta_json=l.meta_json,
                trace_id=l.trace_id,
                created_at=l.created_at,
            )
            for l in logs
        ],
        total=total,
    )


@router.get("/model-usage", response_model=ModelUsageResponse)
async def get_model_usage(
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    await log_audit(db, admin.id, "view_model_usage", request)

    logs_result = await db.execute(
        select(SystemLog).where(SystemLog.event_type == "ai_token_usage")
    )
    logs = logs_result.scalars().all()

    model_stats: dict[str, dict] = {}
    for log in logs:
        meta = log.meta_json or {}
        model_name = meta.get("model", "unknown")
        if model_name not in model_stats:
            model_stats[model_name] = {
                "request_count": 0,
                "input_tokens": 0,
                "output_tokens": 0,
            }
        model_stats[model_name]["request_count"] += 1
        model_stats[model_name]["input_tokens"] += meta.get("prompt_tokens", 0)
        model_stats[model_name]["output_tokens"] += meta.get("completion_tokens", 0)

    return ModelUsageResponse(
        usage=[
            ModelUsageItem(
                model_name=model_name,
                request_count=stats["request_count"],
                input_tokens=stats["input_tokens"],
                output_tokens=stats["output_tokens"],
                failure_count=0,
                fallback_count=0,
            )
            for model_name, stats in model_stats.items()
        ]
    )


@router.post("/impersonation/start", response_model=ImpersonationResponse)
async def start_impersonation(
    req: ImpersonationStart,
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin_verified),
):
    target_result = await db.execute(select(User).where(User.id == req.target_user_id))
    target = target_result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Target user not found")

    imp_session = ImpersonationSession(
        id=str(uuid.uuid4()),
        admin_user_id=admin.id,
        target_user_id=target.id,
        reason=req.reason,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=8),
    )
    db.add(imp_session)

    await log_audit(
        db,
        admin.id,
        "impersonation_start",
        request,
        target_user_id=target.id,
        reason=req.reason,
    )
    await db.commit()

    return ImpersonationResponse(
        impersonation_id=imp_session.id,
        target_user_id=target.id,
        target_username=target.username,
    )


@router.post("/impersonation/{impersonation_id}/end")
async def end_impersonation(
    impersonation_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin_verified),
):
    result = await db.execute(
        select(ImpersonationSession).where(ImpersonationSession.id == impersonation_id)
    )
    imp_session = result.scalar_one_or_none()
    if not imp_session:
        raise HTTPException(status_code=404, detail="Impersonation session not found")
    if imp_session.admin_user_id != admin.id:
        raise HTTPException(status_code=403, detail="Not your impersonation session")

    imp_session.is_active = False
    imp_session.ended_at = datetime.now(timezone.utc)

    await log_audit(
        db,
        admin.id,
        "impersonation_end",
        request,
        target_user_id=imp_session.target_user_id,
    )
    await db.commit()
    return {"status": "success"}


@router.post("/quiz-items/{item_id}/regrade", response_model=RegradeResponse)
async def regrade_item(
    item_id: str,
    req: RegradeRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin_verified),
):
    item_result = await db.execute(select(QuizItem).where(QuizItem.id == item_id))
    item = item_result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Quiz item not found")

    job = Job(
        id=str(uuid.uuid4()),
        job_type="admin_regrade",
        status="pending",
        target_type="quiz_item",
        target_id=item_id,
        payload_json={"reason": req.reason, "admin_user_id": admin.id},
    )
    db.add(job)

    await log_audit(
        db,
        admin.id,
        "regrade_request",
        request,
        target_type="quiz_item",
        target_id=item_id,
        reason=req.reason,
    )
    await db.commit()

    await dispatch_task("admin_regrade", [job.id])

    return RegradeResponse(regrade_job_id=job.id)


@router.post("/settings/models")
async def update_model_settings(
    req: ModelSettingsUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin_verified),
):
    settings_result = await db.execute(select(AdminSettings).limit(1))
    admin_settings = settings_result.scalar_one_or_none()
    if not admin_settings:
        admin_settings = AdminSettings(id=str(uuid.uuid4()))
        db.add(admin_settings)
        await db.flush()

    if req.active_generation_model:
        admin_settings.active_generation_model = req.active_generation_model
    if req.active_grading_model:
        admin_settings.active_grading_model = req.active_grading_model
    if req.fallback_generation_model:
        admin_settings.fallback_generation_model = req.fallback_generation_model
    if req.fallback_grading_model:
        admin_settings.fallback_grading_model = req.fallback_grading_model

    admin_settings.updated_at = datetime.now(timezone.utc)
    admin_settings.updated_by = admin.id

    await log_audit(
        db,
        admin.id,
        "update_model_settings",
        request,
        payload=req.model_dump(),
    )
    await db.commit()

    return {
        "status": "success",
        "settings": {
            "active_generation_model": admin_settings.active_generation_model,
            "active_grading_model": admin_settings.active_grading_model,
            "fallback_generation_model": admin_settings.fallback_generation_model,
            "fallback_grading_model": admin_settings.fallback_grading_model,
        },
    }


@router.get("/announcements", response_model=list[AnnouncementResponse])
async def list_announcements(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    result = await db.execute(
        select(Announcement).order_by(Announcement.created_at.desc()).limit(20)
    )
    return [AnnouncementResponse.model_validate(a) for a in result.scalars().all()]


@router.post("/announcements", response_model=AnnouncementResponse)
async def create_announcement(
    req: AnnouncementCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin_verified),
):
    announcement = Announcement(
        title=req.title,
        body=req.body,
        is_active=req.is_active,
        starts_at=req.starts_at,
        ends_at=req.ends_at,
        created_by=admin.id,
    )
    db.add(announcement)

    await log_audit(
        db,
        admin.id,
        "create_announcement",
        request,
        target_type="announcement",
        target_id=announcement.id,
    )
    await db.commit()
    await db.refresh(announcement)

    return AnnouncementResponse.model_validate(announcement)


@router.get("/audit-logs")
async def list_audit_logs(
    request: Request,
    page: int = 1,
    size: int = 20,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    query = select(AdminAuditLog).order_by(AdminAuditLog.created_at.desc())
    total_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = total_result.scalar() or 0

    result = await db.execute(query.offset((page - 1) * size).limit(size))
    logs = result.scalars().all()

    return {
        "logs": [
            AdminAuditLogItem(
                id=l.id,
                admin_user_id=l.admin_user_id,
                target_user_id=l.target_user_id,
                action_type=l.action_type,
                target_type=l.target_type,
                target_id=l.target_id,
                reason=l.reason,
                payload_json=l.payload_json,
                ip_address=l.ip_address,
                created_at=l.created_at,
            ).model_dump()
            for l in logs
        ],
        "total": total,
    }


@router.get("/system-health", response_model=SystemHealthResponse)
async def get_system_health(
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    components: dict[str, SystemHealthComponent] = {}
    overall_ok = True

    t0 = time.monotonic()
    try:
        await db.execute(text("SELECT 1"))
        components["database"] = SystemHealthComponent(
            status="ok",
            latency_ms=round((time.monotonic() - t0) * 1000, 2),
        )
    except Exception as exc:
        overall_ok = False
        components["database"] = SystemHealthComponent(status="down", detail=str(exc))

    redis_client = getattr(request.app.state, "redis", None)
    if redis_client is not None:
        t0 = time.monotonic()
        try:
            await redis_client.ping()
            components["redis"] = SystemHealthComponent(
                status="ok",
                latency_ms=round((time.monotonic() - t0) * 1000, 2),
            )
        except Exception as exc:
            overall_ok = False
            components["redis"] = SystemHealthComponent(status="down", detail=str(exc))
    else:
        components["redis"] = SystemHealthComponent(
            status="degraded", detail="not configured"
        )

    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)

    error_count_result = await db.execute(
        select(func.count())
        .select_from(SystemLog)
        .where(
            SystemLog.level.in_(["ERROR", "CRITICAL"]),
            SystemLog.created_at >= cutoff,
        )
    )
    error_count = error_count_result.scalar() or 0

    total_log_result = await db.execute(
        select(func.count())
        .select_from(SystemLog)
        .where(SystemLog.created_at >= cutoff)
    )
    total_logs_24h = total_log_result.scalar() or 0

    pending_jobs_result = await db.execute(
        select(func.count())
        .select_from(Job)
        .where(Job.status.in_(["pending", "running"]))
    )
    pending_jobs = pending_jobs_result.scalar() or 0

    failed_jobs_result = await db.execute(
        select(func.count())
        .select_from(Job)
        .where(
            Job.status == "failed",
            Job.created_at >= cutoff,
        )
    )
    failed_jobs_24h = failed_jobs_result.scalar() or 0

    total_users_result = await db.execute(
        select(func.count()).select_from(User).where(User.deleted_at.is_(None))
    )
    total_users = total_users_result.scalar() or 0

    active_users_result = await db.execute(
        select(func.count())
        .select_from(User)
        .where(User.deleted_at.is_(None), User.is_active.is_(True))
    )
    active_users = active_users_result.scalar() or 0

    error_rate = (
        round((error_count / total_logs_24h * 100), 1) if total_logs_24h > 0 else 0.0
    )

    if error_rate > 20 or failed_jobs_24h > 10:
        overall_ok = False

    return SystemHealthResponse(
        status="ok" if overall_ok else "degraded",
        checked_at=datetime.now(timezone.utc),
        components=components,
        stats={
            "total_users": total_users,
            "active_users": active_users,
            "errors_24h": error_count,
            "total_logs_24h": total_logs_24h,
            "error_rate_pct": error_rate,
            "pending_jobs": pending_jobs,
            "failed_jobs_24h": failed_jobs_24h,
        },
    )


@router.get("/dashboard-kpis", response_model=AdminDashboardKPIs)
async def get_dashboard_kpis(
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    cutoff_24h = datetime.now(timezone.utc) - timedelta(hours=24)
    cutoff_7d = datetime.now(timezone.utc) - timedelta(days=7)

    quizzes_today_result = await db.execute(
        select(func.count())
        .select_from(QuizSession)
        .where(QuizSession.created_at >= cutoff_24h)
    )
    quizzes_today = quizzes_today_result.scalar() or 0

    total_quiz_jobs_result = await db.execute(
        select(func.count()).select_from(Job).where(Job.job_type == "generate_quiz")
    )
    total_quiz_jobs = total_quiz_jobs_result.scalar() or 0

    total_storage_result = await db.execute(
        select(func.sum(User.storage_used_bytes))
        .select_from(User)
        .where(User.deleted_at.is_(None))
    )
    total_storage_bytes = total_storage_result.scalar() or 0

    top_storage_result = await db.execute(
        select(User.username, User.storage_used_bytes)
        .where(User.deleted_at.is_(None))
        .order_by(User.storage_used_bytes.desc())
        .limit(5)
    )
    top_users_by_storage = [
        TopStorageUser(username=row[0], storage_used_bytes=row[1])
        for row in top_storage_result.fetchall()
    ]

    ai_token_result = await db.execute(
        select(func.count())
        .select_from(SystemLog)
        .where(
            SystemLog.event_type == "ai_token_usage", SystemLog.created_at >= cutoff_24h
        )
    )
    ai_token_usage_24h = ai_token_result.scalar() or 0

    errors_result = await db.execute(
        select(SystemLog.event_type, func.count().label("cnt"))
        .where(
            SystemLog.level.in_(["ERROR", "CRITICAL"]),
            SystemLog.created_at >= cutoff_24h,
        )
        .group_by(SystemLog.event_type)
        .order_by(func.count().desc())
        .limit(3)
    )
    top_errors_24h = [
        TopErrorItem(event_type=row[0], count=row[1])
        for row in errors_result.fetchall()
    ]

    signups_result = await db.execute(
        select(func.count())
        .select_from(User)
        .where(User.created_at >= cutoff_7d, User.deleted_at.is_(None))
    )
    signups_7d = signups_result.scalar() or 0

    dau_result = await db.execute(
        select(func.count())
        .select_from(User)
        .where(User.last_login_at >= cutoff_24h, User.deleted_at.is_(None))
    )
    dau = dau_result.scalar() or 0

    job_queue_result = await db.execute(
        select(Job.status, Job.job_type, func.count().label("cnt")).group_by(
            Job.status, Job.job_type
        )
    )
    job_queue = [
        JobQueueItem(status=row[0], job_type=row[1], count=row[2])
        for row in job_queue_result.fetchall()
    ]

    return AdminDashboardKPIs(
        quizzes_today=quizzes_today,
        total_quiz_jobs=total_quiz_jobs,
        total_storage_bytes=total_storage_bytes,
        ai_token_usage_24h=ai_token_usage_24h,
        signups_7d=signups_7d,
        dau=dau,
        top_users_by_storage=top_users_by_storage,
        top_errors_24h=top_errors_24h,
        job_queue=job_queue,
    )


_JOB_TYPE_TASK_MAP: dict[str, str] = {
    "process_file": "process_file",
    "generate_quiz": "generate_quiz",
    "grade_exam": "grade_exam",
    "review_objection": "review_objection",
    "admin_regrade": "admin_regrade",
}


@router.get("/jobs", response_model=AdminJobListResponse)
async def list_jobs(
    request: Request,
    status: str | None = None,
    job_type: str | None = None,
    page: int = 1,
    size: int = 20,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    query = select(Job).order_by(Job.created_at.desc())
    if status:
        query = query.where(Job.status == status)
    if job_type:
        query = query.where(Job.job_type == job_type)

    total_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = total_result.scalar() or 0

    result = await db.execute(query.offset((page - 1) * size).limit(size))
    jobs = result.scalars().all()

    return AdminJobListResponse(
        jobs=[AdminJobItem.model_validate(j) for j in jobs],
        total=total,
    )


@router.post("/jobs/{job_id}/retry")
async def retry_job(
    job_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin_verified),
):
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status != "failed":
        raise HTTPException(status_code=400, detail="Only failed jobs can be retried")

    job.status = "pending"
    job.retry_count += 1
    job.error_message = None

    await log_audit(
        db,
        admin.id,
        "job_retry",
        request,
        target_type="job",
        target_id=job_id,
    )
    await db.commit()

    task_name = _JOB_TYPE_TASK_MAP.get(job.job_type)
    if task_name:
        await dispatch_task(task_name, [job.id])

    return {"status": "ok", "job_id": job_id}


@router.post("/jobs/{job_id}/cancel")
async def cancel_job(
    job_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin_verified),
):
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status in ("completed", "failed"):
        raise HTTPException(
            status_code=400, detail="Cannot cancel completed or failed jobs"
        )

    if job.celery_task_id:
        await asyncio.to_thread(
            celery_app.control.revoke, job.celery_task_id, terminate=True
        )

    job.status = "failed"
    job.error_message = "Cancelled by admin"

    await log_audit(
        db,
        admin.id,
        "job_cancel",
        request,
        target_type="job",
        target_id=job_id,
    )
    await db.commit()

    return {"status": "ok", "job_id": job_id}


@router.get("/files-pipeline", response_model=AdminFilePipelineResponse)
async def get_files_pipeline(
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    breakdown_result = await db.execute(
        select(File.status, func.count().label("count")).group_by(File.status)
    )
    status_breakdown = [
        AdminFileStatusBreakdown(status=str(row[0]), count=row[1])
        for row in breakdown_result.fetchall()
    ]

    in_progress_result = await db.execute(
        select(
            File.id,
            File.original_filename,
            File.status,
            File.user_id,
            User.username,
            File.processing_started_at,
            File.retry_count,
        )
        .join(User, File.user_id == User.id)
        .where(
            File.status.in_(
                [
                    FileStatus.parsing,
                    FileStatus.ocr_processing,
                    FileStatus.embedding_processing,
                ]
            )
        )
        .order_by(File.processing_started_at.desc())
        .limit(100)
    )
    in_progress = [
        AdminFileInProgress(
            id=row[0],
            original_filename=row[1],
            status=str(row[2]),
            user_id=row[3],
            username=row[4],
            processing_started_at=row[5],
            retry_count=row[6],
        )
        for row in in_progress_result.fetchall()
    ]

    failures_result = await db.execute(
        select(
            File.id,
            File.original_filename,
            File.status,
            File.user_id,
            User.username,
            File.parse_error_code,
            File.processing_finished_at,
        )
        .join(User, File.user_id == User.id)
        .where(
            File.status.in_(
                [
                    FileStatus.failed_partial,
                    FileStatus.failed_terminal,
                ]
            )
        )
        .order_by(File.processing_finished_at.desc())
        .limit(50)
    )
    recent_failures = [
        AdminFileFailure(
            id=row[0],
            original_filename=row[1],
            status=str(row[2]),
            user_id=row[3],
            username=row[4],
            parse_error_code=row[5],
            processing_finished_at=row[6],
        )
        for row in failures_result.fetchall()
    ]

    return AdminFilePipelineResponse(
        status_breakdown=status_breakdown,
        in_progress=in_progress,
        recent_failures=recent_failures,
    )


@router.get("/db-diagnostics", response_model=AdminDbDiagnostics)
async def get_db_diagnostics(
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    tables_result = await db.execute(
        text(
            "SELECT name FROM sqlite_master"
            " WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        )
    )
    table_names = [row[0] for row in tables_result.fetchall()]
    tables = [
        AdminDbTableInfo(name=name, row_estimate=0, total_size="N/A")
        for name in table_names
    ]

    alembic_exists_result = await db.execute(
        text(
            "SELECT name FROM sqlite_master"
            " WHERE type='table' AND name='alembic_version'"
        )
    )
    migration_version: str | None = None
    if alembic_exists_result.scalar_one_or_none():
        version_result = await db.execute(
            text("SELECT version_num FROM alembic_version")
        )
        migration_version = version_result.scalar_one_or_none()

    page_count_result = await db.execute(text("PRAGMA page_count"))
    page_count = page_count_result.scalar() or 0
    page_size_result = await db.execute(text("PRAGMA page_size"))
    page_size = page_size_result.scalar() or 0
    total_bytes = page_count * page_size
    if total_bytes >= 1024 * 1024:
        db_total_size = f"{total_bytes / (1024 * 1024):.2f} MB"
    else:
        db_total_size = f"{total_bytes / 1024:.2f} KB"

    return AdminDbDiagnostics(
        tables=tables,
        migration_version=migration_version,
        db_total_size=db_total_size,
        checked_at=datetime.now(timezone.utc),
    )
