"""Centralized helper for writing admin audit log entries.

Use this from any module (admin API, billing, auth flows, etc.) to record
who triggered which admin-relevant event. The helper auto-captures HTTP
context from the Request and identity context from the User, so call sites
remain short.
"""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.middleware.auth import get_client_ip
from app.models.admin import AdminAuditLog
from app.models.user import User


def _truncate(value: str | None, limit: int) -> str | None:
    if value is None:
        return None
    if len(value) <= limit:
        return value
    return value[: limit - 1] + "…"


async def record_admin_action(
    db: AsyncSession,
    *,
    request: Request,
    action_type: str,
    admin: User | None = None,
    admin_user_id: str | None = None,
    admin_email: str | None = None,
    admin_role: str | None = None,
    target_user_id: str | None = None,
    target_type: str | None = None,
    target_id: str | None = None,
    reason: str | None = None,
    payload: dict[str, Any] | None = None,
    success: bool = True,
) -> AdminAuditLog:
    """Record an admin action with full identity + HTTP context.

    Pass ``admin`` for normal admin endpoints (its id/email/role are read).
    Pass the explicit ``admin_*`` overrides for cases where ``admin`` may be
    ``None`` — most importantly the master-password verify endpoint, which
    must record failed attempts even when the caller's identity is partial.
    """
    if admin is not None:
        if admin_user_id is None:
            admin_user_id = admin.id
        if admin_email is None:
            admin_email = admin.email
        if admin_role is None:
            admin_role = admin.role.value if admin.role is not None else None

    request_id = getattr(request.state, "request_id", None)
    log = AdminAuditLog(
        id=str(uuid.uuid4()),
        admin_user_id=admin_user_id,
        admin_email=_truncate(admin_email, 255),
        admin_role=_truncate(admin_role, 20),
        target_user_id=target_user_id,
        action_type=action_type,
        target_type=target_type,
        target_id=target_id,
        reason=reason,
        payload_json=payload,
        ip_address=get_client_ip(request),
        user_agent=_truncate(request.headers.get("user-agent"), 500),
        request_method=request.method,
        request_path=_truncate(request.url.path, 500),
        request_id=_truncate(request_id, 64),
        success=success,
    )
    db.add(log)
    await db.flush()
    return log
