import asyncio
import csv
import io
import time
import uuid
from datetime import date, datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func, text, cast, Integer, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.rate_limit import limiter
from app.models.user import User, UserRole, AdminSettings
from app.models.admin import SystemLog, AdminAuditLog, Announcement
from app.models.file import File, FileStatus
from app.models.quiz import QuizItem, QuizSession
from app.models.search import ImpersonationSession, Job
from app.schemas.admin import (
    MasterPasswordVerify,
    AdminUserItem,
    AdminUserListResponse,
    AdminStatusResponse,
    AdminUserStatusUpdate,
    AdminUserRoleUpdate,
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
    AdminRateLimitEvent,
    AdminRateLimitTopPath,
    AdminRateLimitResponse,
)
from app.middleware.auth import (
    require_admin,
    require_admin_verified,
    require_super_admin,
    hash_password,
    verify_password,
    create_admin_token,
    get_client_ip,
)
from app.utils.db_helpers import paginate
from app.workers.celery_app import celery_app, dispatch_task
from app.models.search import RefreshToken

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

    query = (
        select(User).where(User.deleted_at.is_(None)).order_by(User.created_at.desc())
    )
    users, total = await paginate(db, query, page, size)

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
                role=u.role.value,
            )
            for u in users
        ],
        total=total,
    )


@router.patch("/users/{user_id}/status", response_model=AdminUserItem)
async def update_user_status(
    user_id: str,
    req: AdminUserStatusUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin_verified),
):
    user_result = await db.execute(
        select(User).where(User.id == user_id, User.deleted_at.is_(None))
    )
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not req.is_active and user.role == UserRole.super_admin:
        active_sa_result = await db.execute(
            select(func.count())
            .select_from(User)
            .where(
                User.role == UserRole.super_admin,
                User.is_active.is_(True),
                User.deleted_at.is_(None),
            )
        )
        active_sa_count = active_sa_result.scalar() or 0
        if active_sa_count <= 1:
            raise HTTPException(
                status_code=400,
                detail="Cannot deactivate the last super_admin",
            )

    user.is_active = req.is_active
    await log_audit(
        db,
        admin.id,
        "update_user_status",
        request,
        target_user_id=user_id,
        payload={"is_active": req.is_active},
    )
    await db.commit()
    await db.refresh(user)

    return AdminUserItem(
        id=user.id,
        username=user.username,
        email=user.email,
        created_at=user.created_at,
        storage_used_bytes=user.storage_used_bytes,
        last_login_at=user.last_login_at,
        is_active=user.is_active,
        role=user.role.value,
    )


@router.patch("/users/{user_id}/role", response_model=AdminUserItem)
async def update_user_role(
    user_id: str,
    req: AdminUserRoleUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin_verified),
):
    if admin.id == user_id:
        raise HTTPException(status_code=400, detail="Cannot change your own role")

    if req.new_role == "super_admin" and admin.role != UserRole.super_admin:
        raise HTTPException(
            status_code=403,
            detail="Only super_admin can grant super_admin role",
        )

    user_result = await db.execute(
        select(User).where(User.id == user_id, User.deleted_at.is_(None))
    )
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    old_role = user.role.value
    user.role = UserRole(req.new_role)
    await log_audit(
        db,
        admin.id,
        "update_user_role",
        request,
        target_user_id=user_id,
        payload={"old_role": old_role, "new_role": req.new_role},
    )
    await db.commit()
    await db.refresh(user)

    return AdminUserItem(
        id=user.id,
        username=user.username,
        email=user.email,
        created_at=user.created_at,
        storage_used_bytes=user.storage_used_bytes,
        last_login_at=user.last_login_at,
        is_active=user.is_active,
        role=user.role.value,
    )


@router.delete("/users/{user_id}", response_model=AdminStatusResponse)
async def delete_user(
    user_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin_verified),
):
    if admin.id == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    user_result = await db.execute(
        select(User).where(User.id == user_id, User.deleted_at.is_(None))
    )
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.role == UserRole.super_admin and user.is_active:
        active_sa_result = await db.execute(
            select(func.count())
            .select_from(User)
            .where(
                User.role == UserRole.super_admin,
                User.is_active.is_(True),
                User.deleted_at.is_(None),
            )
        )
        active_sa_count = active_sa_result.scalar() or 0
        if active_sa_count <= 1:
            raise HTTPException(
                status_code=400,
                detail="Cannot delete the last active super_admin",
            )

    now = datetime.now(timezone.utc)
    await db.execute(
        update(RefreshToken)
        .where(
            RefreshToken.user_id == user.id,
            RefreshToken.revoked_at.is_(None),
        )
        .values(revoked_at=now)
    )
    user.is_active = False
    user.status = "deleted"
    user.deleted_at = now
    await log_audit(
        db,
        admin.id,
        "delete_user",
        request,
        target_user_id=user_id,
        payload={"status": "deleted"},
    )
    await db.commit()

    return AdminStatusResponse(status="deleted")


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

    logs, total = await paginate(db, query, page, size)

    return AdminLogResponse(
        logs=[
            AdminLogItem(
                id=log.id,
                level=log.level,
                service_name=log.service_name,
                event_type=log.event_type,
                message=log.message,
                meta_json=log.meta_json,
                trace_id=log.trace_id,
                created_at=log.created_at,
            )
            for log in logs
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

    model_col = SystemLog.meta_json["model"].as_string()
    result = await db.execute(
        select(
            func.coalesce(model_col, "unknown").label("model_name"),
            func.count().label("request_count"),
            func.coalesce(
                func.sum(
                    cast(SystemLog.meta_json["prompt_tokens"].as_string(), Integer)
                ),
                0,
            ).label("input_tokens"),
            func.coalesce(
                func.sum(
                    cast(SystemLog.meta_json["completion_tokens"].as_string(), Integer)
                ),
                0,
            ).label("output_tokens"),
        )
        .where(SystemLog.event_type == "ai_token_usage")
        .group_by(model_col)
    )
    rows = result.fetchall()

    return ModelUsageResponse(
        usage=[
            ModelUsageItem(
                model_name=row.model_name,
                request_count=row.request_count,
                input_tokens=row.input_tokens,
                output_tokens=row.output_tokens,
                failure_count=0,
                fallback_count=0,
            )
            for row in rows
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

    dispatch_task("admin_regrade", [job.id])

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
    if req.fallback_generation_model:
        admin_settings.fallback_generation_model = req.fallback_generation_model

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
            "fallback_generation_model": admin_settings.fallback_generation_model,
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


@router.delete("/announcements/{announcement_id}", status_code=204)
async def delete_announcement(
    announcement_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin_verified),
):
    result = await db.execute(
        select(Announcement).where(Announcement.id == announcement_id)
    )
    announcement = result.scalar_one_or_none()
    if not announcement:
        raise HTTPException(status_code=404, detail="Announcement not found")

    await log_audit(
        db,
        admin.id,
        "delete_announcement",
        request,
        target_type="announcement",
        target_id=announcement_id,
    )
    await db.delete(announcement)
    await db.commit()


@router.get("/audit-logs")
async def list_audit_logs(
    request: Request,
    page: int = 1,
    size: int = 20,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    query = select(AdminAuditLog).order_by(AdminAuditLog.created_at.desc())
    logs, total = await paginate(db, query, page, size)

    return {
        "logs": [
            AdminAuditLogItem(
                id=entry.id,
                admin_user_id=entry.admin_user_id,
                target_user_id=entry.target_user_id,
                action_type=entry.action_type,
                target_type=entry.target_type,
                target_id=entry.target_id,
                reason=entry.reason,
                payload_json=entry.payload_json,
                ip_address=entry.ip_address,
                created_at=entry.created_at,
            ).model_dump()
            for entry in logs
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

    counts_row = (
        await db.execute(
            select(
                select(func.count())
                .select_from(SystemLog)
                .where(
                    SystemLog.level.in_(["ERROR", "CRITICAL"]),
                    SystemLog.created_at >= cutoff,
                )
                .correlate(None)
                .scalar_subquery()
                .label("error_count"),
                select(func.count())
                .select_from(SystemLog)
                .where(SystemLog.created_at >= cutoff)
                .correlate(None)
                .scalar_subquery()
                .label("total_logs_24h"),
                select(func.count())
                .select_from(Job)
                .where(Job.status.in_(["pending", "running"]))
                .correlate(None)
                .scalar_subquery()
                .label("pending_jobs"),
                select(func.count())
                .select_from(Job)
                .where(Job.status == "failed", Job.created_at >= cutoff)
                .correlate(None)
                .scalar_subquery()
                .label("failed_jobs_24h"),
                select(func.count())
                .select_from(User)
                .where(User.deleted_at.is_(None))
                .correlate(None)
                .scalar_subquery()
                .label("total_users"),
                select(func.count())
                .select_from(User)
                .where(User.deleted_at.is_(None), User.is_active.is_(True))
                .correlate(None)
                .scalar_subquery()
                .label("active_users"),
            )
        )
    ).one()

    error_count = counts_row.error_count or 0
    total_logs_24h = counts_row.total_logs_24h or 0
    pending_jobs = counts_row.pending_jobs or 0
    failed_jobs_24h = counts_row.failed_jobs_24h or 0
    total_users = counts_row.total_users or 0
    active_users = counts_row.active_users or 0

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

    # --- Batch all scalar aggregates into one query ---
    scalars_row = (
        await db.execute(
            select(
                select(func.count())
                .select_from(QuizSession)
                .where(QuizSession.created_at >= cutoff_24h)
                .correlate(None)
                .scalar_subquery()
                .label("quizzes_today"),
                select(func.count())
                .select_from(Job)
                .where(Job.job_type == "generate_quiz")
                .correlate(None)
                .scalar_subquery()
                .label("total_quiz_jobs"),
                select(func.coalesce(func.sum(User.storage_used_bytes), 0))
                .select_from(User)
                .where(User.deleted_at.is_(None))
                .correlate(None)
                .scalar_subquery()
                .label("total_storage_bytes"),
                select(func.count())
                .select_from(SystemLog)
                .where(
                    SystemLog.event_type == "ai_token_usage",
                    SystemLog.created_at >= cutoff_24h,
                )
                .correlate(None)
                .scalar_subquery()
                .label("ai_token_usage_24h"),
                select(func.count())
                .select_from(User)
                .where(User.created_at >= cutoff_7d, User.deleted_at.is_(None))
                .correlate(None)
                .scalar_subquery()
                .label("signups_7d"),
                select(func.count())
                .select_from(User)
                .where(User.last_login_at >= cutoff_24h, User.deleted_at.is_(None))
                .correlate(None)
                .scalar_subquery()
                .label("dau"),
            )
        )
    ).one()

    quizzes_today = scalars_row.quizzes_today or 0
    total_quiz_jobs = scalars_row.total_quiz_jobs or 0
    total_storage_bytes = scalars_row.total_storage_bytes or 0
    ai_token_usage_24h = scalars_row.ai_token_usage_24h or 0
    signups_7d = scalars_row.signups_7d or 0
    dau = scalars_row.dau or 0

    # --- List queries (return rows, must stay separate) ---
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

    jobs, total = await paginate(db, query, page, size)

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
        dispatch_task(task_name, [job.id])

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


async def _fetch_pg_table_info(db: AsyncSession) -> list[AdminDbTableInfo]:
    result = await db.execute(
        text(
            "SELECT tablename, "
            "  pg_size_pretty(pg_total_relation_size(quote_ident(tablename))) AS total_size, "
            "  (SELECT reltuples::bigint FROM pg_class WHERE relname = tablename) AS row_estimate "
            "FROM pg_tables "
            "WHERE schemaname = 'public' "
            "ORDER BY tablename"
        )
    )
    return [
        AdminDbTableInfo(
            name=row[0], row_estimate=max(0, row[2] or 0), total_size=row[1] or "N/A"
        )
        for row in result.fetchall()
    ]


async def _fetch_pg_db_size(db: AsyncSession) -> str:
    result = await db.execute(
        text("SELECT pg_size_pretty(pg_database_size(current_database()))")
    )
    return result.scalar() or "N/A"


@router.get("/db-diagnostics", response_model=AdminDbDiagnostics)
async def get_db_diagnostics(
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    tables = await _fetch_pg_table_info(db)

    migration_version: str | None = None
    try:
        version_result = await db.execute(
            text("SELECT version_num FROM alembic_version LIMIT 1")
        )
        migration_version = version_result.scalar_one_or_none()
    except Exception:
        pass

    db_total_size = await _fetch_pg_db_size(db)

    return AdminDbDiagnostics(
        tables=tables,
        migration_version=migration_version,
        db_total_size=db_total_size,
        checked_at=datetime.now(timezone.utc),
    )


@router.get("/rate-limits", response_model=AdminRateLimitResponse)
async def get_rate_limits(
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)

    logs_result = await db.execute(
        select(SystemLog).where(
            SystemLog.event_type == "rate_limit_exceeded",
            SystemLog.created_at >= cutoff,
        )
    )
    logs = logs_result.scalars().all()

    # Group by (client_ip, path) in Python — stays SQLite-compatible
    groups: dict[tuple, dict] = {}
    for log in logs:
        meta = log.meta_json or {}
        client_ip = meta.get("client_ip", "unknown")
        path = meta.get("path", "unknown")
        key = (client_ip, path)
        if key not in groups:
            groups[key] = {
                "client_ip": client_ip,
                "path": path,
                "event_count": 0,
                "latest_event": log.created_at,
            }
        groups[key]["event_count"] += 1
        if log.created_at and (
            groups[key]["latest_event"] is None
            or log.created_at > groups[key]["latest_event"]
        ):
            groups[key]["latest_event"] = log.created_at

    sorted_events = sorted(
        groups.values(), key=lambda x: x["event_count"], reverse=True
    )[:100]

    unique_ips = len({g["client_ip"] for g in groups.values()})

    path_counts: dict[str, int] = {}
    for g in groups.values():
        path_counts[g["path"]] = path_counts.get(g["path"], 0) + g["event_count"]
    top_paths = sorted(path_counts.items(), key=lambda x: x[1], reverse=True)[:5]

    return AdminRateLimitResponse(
        events=[
            AdminRateLimitEvent(
                client_ip=e["client_ip"],
                path=e["path"],
                event_count=e["event_count"],
                latest_event=e["latest_event"],
            )
            for e in sorted_events
        ],
        total_events_24h=len(logs),
        unique_ips_count=unique_ips,
        top_paths=[AdminRateLimitTopPath(path=p, count=c) for p, c in top_paths],
    )


@router.get("/export/users")
async def export_users_csv(
    request: Request,
    is_active: bool | None = None,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    query = (
        select(User).where(User.deleted_at.is_(None)).order_by(User.created_at.desc())
    )
    if is_active is not None:
        query = query.where(User.is_active == is_active)

    result = await db.execute(query)
    users = result.scalars().all()

    async def csv_generator():
        buf = io.StringIO()
        buf.write("\ufeff")  # UTF-8 BOM
        yield buf.getvalue()
        buf.seek(0)
        buf.truncate()

        writer = csv.writer(buf)
        writer.writerow(
            ["id", "username", "email", "created_at", "storage_used_bytes", "is_active"]
        )
        yield buf.getvalue()
        buf.seek(0)
        buf.truncate()

        for u in users:
            writer.writerow(
                [
                    u.id,
                    u.username,
                    u.email,
                    u.created_at,
                    u.storage_used_bytes,
                    u.is_active,
                ]
            )
            yield buf.getvalue()
            buf.seek(0)
            buf.truncate()

    return StreamingResponse(
        csv_generator(),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="admin_users_{date.today()}.csv"'
        },
    )


@router.get("/export/logs")
async def export_logs_csv(
    request: Request,
    level: str | None = None,
    service_name: str | None = None,
    event_type: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    query = select(SystemLog).order_by(SystemLog.created_at.desc())
    if level:
        query = query.where(SystemLog.level == level)
    if service_name:
        query = query.where(SystemLog.service_name == service_name)
    if event_type:
        query = query.where(SystemLog.event_type == event_type)
    if date_from:
        query = query.where(SystemLog.created_at >= date_from)
    if date_to:
        query = query.where(SystemLog.created_at <= date_to)

    result = await db.execute(query)
    logs = result.scalars().all()

    async def csv_generator():
        buf = io.StringIO()
        buf.write("\ufeff")  # UTF-8 BOM
        yield buf.getvalue()
        buf.seek(0)
        buf.truncate()

        writer = csv.writer(buf)
        writer.writerow(
            ["created_at", "level", "service_name", "event_type", "message"]
        )
        yield buf.getvalue()
        buf.seek(0)
        buf.truncate()

        for log in logs:
            message = (log.message or "")[:100]
            writer.writerow(
                [log.created_at, log.level, log.service_name, log.event_type, message]
            )
            yield buf.getvalue()
            buf.seek(0)
            buf.truncate()

    return StreamingResponse(
        csv_generator(),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="admin_logs_{date.today()}.csv"'
        },
    )


@router.get("/export/audit-logs")
async def export_audit_logs_csv(
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin_verified),
):
    result = await db.execute(
        select(AdminAuditLog).order_by(AdminAuditLog.created_at.desc()).limit(1000)
    )
    logs = result.scalars().all()

    async def csv_generator():
        buf = io.StringIO()
        buf.write("\ufeff")  # UTF-8 BOM
        yield buf.getvalue()
        buf.seek(0)
        buf.truncate()

        writer = csv.writer(buf)
        writer.writerow(
            [
                "created_at",
                "admin_user_id",
                "target_user_id",
                "action_type",
                "target_type",
                "ip_address",
            ]
        )
        yield buf.getvalue()
        buf.seek(0)
        buf.truncate()

        for log in logs:
            writer.writerow(
                [
                    log.created_at,
                    log.admin_user_id,
                    log.target_user_id,
                    log.action_type,
                    log.target_type,
                    log.ip_address,
                ]
            )
            yield buf.getvalue()
            buf.seek(0)
            buf.truncate()

    return StreamingResponse(
        csv_generator(),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="admin_audit_logs_{date.today()}.csv"'
        },
    )
