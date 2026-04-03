import secrets
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from jose import jwt, JWTError
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timedelta, timezone

from app.config import settings
from app.database import get_db
from app.models.user import User
from app.models.search import PasswordResetToken, RefreshToken
from app.rate_limit import limiter
from app.schemas.auth import (
    SignupRequest,
    SignupResponse,
    LoginRequest,
    LoginResponse,
    PasswordResetRequest,
    PasswordResetConfirm,
    UserProfile,
    RefreshTokenRequest,
    DeleteAccountRequest,
)
from app.middleware.auth import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    get_current_user,
)
from app.utils.email import send_password_reset_email

router = APIRouter()


@router.post("/signup", response_model=SignupResponse)
@limiter.limit("5/minute")
async def signup(
    request: Request, req: SignupRequest, db: AsyncSession = Depends(get_db)
):
    existing = await db.execute(
        select(User).where((User.username == req.username) | (User.email == req.email))
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=409,
            detail="Registration failed. Please try different credentials.",
        )

    user = User(
        username=req.username,
        email=req.email,
        password_hash=hash_password(req.password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return SignupResponse(
        user_id=user.id, username=user.username, created_at=user.created_at
    )


@router.post("/login", response_model=LoginResponse)
@limiter.limit("10/minute")
async def login(
    request: Request, req: LoginRequest, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(User).where(
            (User.username == req.username_or_email)
            | (User.email == req.username_or_email),
            User.deleted_at.is_(None),
        )
    )
    user = result.scalar_one_or_none()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")

    user.last_login_at = datetime.now(timezone.utc)

    profile = UserProfile(
        id=user.id,
        username=user.username,
        email=user.email,
        role=user.role.value,
        is_active=user.is_active,
        storage_used_bytes=user.storage_used_bytes,
        storage_quota_bytes=user.storage_quota_bytes,
        last_login_at=user.last_login_at,
    )

    jti = str(uuid.uuid4())
    access_token = create_access_token(user.id, user.role.value)
    refresh_token = create_refresh_token(user.id, user.role.value, jti=jti)
    db.add(
        RefreshToken(
            id=jti,
            user_id=user.id,
            expires_at=datetime.now(timezone.utc)
            + timedelta(days=settings.refresh_token_expire_days),
        )
    )
    await db.commit()

    return LoginResponse(
        access_token=access_token, refresh_token=refresh_token, user=profile
    )


@router.post("/password/reset/request")
@limiter.limit("3/minute")
async def password_reset_request(
    request: Request, req: PasswordResetRequest, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(User).where(User.email == req.email))
    user = result.scalar_one_or_none()
    if not user:
        return {"status": "accepted"}

    token = secrets.token_urlsafe(32)
    selector = token[:16]
    verifier = token[16:]
    verifier_hash = hash_password(verifier)
    reset_token = PasswordResetToken(
        user_id=user.id,
        selector=selector,
        token_hash=verifier_hash,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
    )
    db.add(reset_token)
    await db.commit()

    await send_password_reset_email(user.email, token)

    return {"status": "accepted"}


@router.post("/password/reset/confirm")
@limiter.limit("5/minute")
async def password_reset_confirm(
    request: Request, req: PasswordResetConfirm, db: AsyncSession = Depends(get_db)
):
    selector = req.token[:16]
    verifier = req.token[16:]

    result = await db.execute(
        select(PasswordResetToken).where(PasswordResetToken.selector == selector)
    )
    token_record = result.scalar_one_or_none()
    if not token_record:
        raise HTTPException(status_code=400, detail="Invalid token")
    if token_record.used_at:
        raise HTTPException(status_code=400, detail="Token already used")
    if datetime.now(timezone.utc) > token_record.expires_at:
        raise HTTPException(status_code=400, detail="Token expired")
    if not verify_password(verifier, token_record.token_hash):
        raise HTTPException(status_code=400, detail="Invalid token")

    user_result = await db.execute(select(User).where(User.id == token_record.user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.password_hash = hash_password(req.new_password)
    token_record.used_at = datetime.now(timezone.utc)
    await db.commit()
    return {"status": "success"}


@router.post("/refresh")
async def refresh_token(req: RefreshTokenRequest, db: AsyncSession = Depends(get_db)):
    try:
        payload = jwt.decode(
            req.refresh_token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
        )
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user_id = payload.get("sub")
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user or not user.is_active:
            raise HTTPException(status_code=401, detail="User not found")

        jti = payload.get("jti")
        if jti:
            stored_result = await db.execute(
                select(RefreshToken).where(
                    RefreshToken.id == jti, RefreshToken.revoked_at.is_(None)
                )
            )
            stored_token = stored_result.scalar_one_or_none()
            if not stored_token:
                raise HTTPException(status_code=401, detail="Token revoked")
            stored_token.revoked_at = datetime.now(timezone.utc)

        new_jti = str(uuid.uuid4())
        access_token = create_access_token(user.id, user.role.value)
        new_refresh_token = create_refresh_token(user.id, user.role.value, jti=new_jti)
        db.add(
            RefreshToken(
                id=new_jti,
                user_id=user.id,
                expires_at=datetime.now(timezone.utc)
                + timedelta(days=settings.refresh_token_expire_days),
            )
        )
        await db.commit()

        return {
            "access_token": access_token,
            "refresh_token": new_refresh_token,
            "token_type": "bearer",
        }
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")


@router.post("/logout")
async def logout(req: RefreshTokenRequest, db: AsyncSession = Depends(get_db)):
    try:
        payload = jwt.decode(
            req.refresh_token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
        )
        jti = payload.get("jti")
        if jti:
            result = await db.execute(
                select(RefreshToken).where(RefreshToken.id == jti)
            )
            token = result.scalar_one_or_none()
            if token:
                token.revoked_at = datetime.now(timezone.utc)
                await db.commit()
    except JWTError:
        pass
    return {"status": "ok"}


@router.get("/me", response_model=UserProfile)
async def get_me(user: User = Depends(get_current_user)):
    return UserProfile(
        id=user.id,
        username=user.username,
        email=user.email,
        role=user.role.value,
        is_active=user.is_active,
        storage_used_bytes=user.storage_used_bytes,
        storage_quota_bytes=user.storage_quota_bytes,
        last_login_at=user.last_login_at,
    )


@router.delete("/me", status_code=200)
async def delete_account(
    req: DeleteAccountRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=400, detail="비밀번호가 올바르지 않습니다.")

    tokens_result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.user_id == user.id,
            RefreshToken.revoked_at.is_(None),
        )
    )
    for token in tokens_result.scalars().all():
        token.revoked_at = datetime.now(timezone.utc)

    user.is_active = False
    user.status = "deleted"
    user.deleted_at = datetime.now(timezone.utc)

    await db.commit()
    return {"status": "ok"}
