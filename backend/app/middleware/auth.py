import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional
import jwt as _jwt
from jwt import InvalidTokenError as JWTError
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.user import User, UserRole
from app.models.search import ImpersonationSession

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(
    user_id: str, role: str, expires_delta: timedelta | None = None
) -> str:
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.access_token_expire_minutes)
    )
    return _jwt.encode(
        {"sub": user_id, "role": role, "exp": expire, "type": "access"},
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )


def create_refresh_token(user_id: str, role: str, jti: str | None = None) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        days=settings.refresh_token_expire_days
    )
    if jti is None:
        jti = str(uuid.uuid4())
    payload = {
        "sub": user_id,
        "role": role,
        "exp": expire,
        "type": "refresh",
        "jti": jti,
    }
    return _jwt.encode(
        payload,
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )


def create_admin_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.admin_session_expire_minutes
    )
    return _jwt.encode(
        {"sub": user_id, "role": "admin_verified", "exp": expire, "type": "admin"},
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    token = credentials.credentials
    try:
        payload = _jwt.decode(
            token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm]
        )
        user_id = payload.get("sub")
        token_type = payload.get("type")
        if not isinstance(user_id, str) or token_type != "access":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
            )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
        )

    result = await db.execute(
        select(User).where(User.id == user_id, User.deleted_at.is_(None))
    )
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )
    return user


async def get_current_user_id(
    user: User = Depends(get_current_user),
) -> str:
    return user.id


async def require_admin(
    user: User = Depends(get_current_user),
) -> User:
    if user.role not in (UserRole.admin, UserRole.super_admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required"
        )
    return user


async def require_super_admin(
    user: User = Depends(get_current_user),
) -> User:
    if user.role != UserRole.super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Super admin access required"
        )
    return user


async def require_admin_verified(
    request: Request,
    user: User = Depends(require_admin),
) -> User:
    admin_token = request.headers.get("X-Admin-Token")
    if not admin_token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin verification required",
        )
    try:
        payload = _jwt.decode(
            admin_token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
        )
        if payload.get("type") != "admin" or payload.get("sub") != user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid or expired admin token",
            )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid or expired admin token",
        )
    return user


async def get_impersonation_context(
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> tuple[User, bool]:
    imp_header = request.headers.get("X-Impersonation-Session-Id")
    if not imp_header:
        return user, False

    if user.role not in (UserRole.admin, UserRole.super_admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Impersonation requires admin role",
        )

    result = await db.execute(
        select(ImpersonationSession).where(
            ImpersonationSession.id == imp_header,
            ImpersonationSession.admin_user_id == user.id,
            ImpersonationSession.is_active == True,
            ImpersonationSession.expires_at > datetime.now(timezone.utc),
        )
    )
    imp_session = result.scalar_one_or_none()
    if imp_session is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid impersonation session",
        )

    target_result = await db.execute(
        select(User).where(User.id == imp_session.target_user_id)
    )
    target_user = target_result.scalar_one_or_none()
    if target_user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Target user not found"
        )

    return target_user, True


def get_client_ip(request: Request) -> str:
    from app.rate_limit import _get_real_client_ip

    return _get_real_client_ip(request)
