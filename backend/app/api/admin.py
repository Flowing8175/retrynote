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
from app.workers.celery_app import dispatch_task

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

    return ModelUsageResponse(
        usage=[
            ModelUsageItem(
                model_name="gpt-4o",
                request_count=0,
                input_tokens=0,
                output_tokens=0,
                failure_count=0,
                fallback_count=0,
            ),
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
