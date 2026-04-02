from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timedelta, timezone

from app.database import get_db
from app.models.user import User
from app.models.search import PasswordResetToken
from app.schemas.auth import (
    SignupRequest,
    SignupResponse,
    LoginRequest,
    LoginResponse,
    PasswordResetRequest,
    PasswordResetConfirm,
    UserProfile,
    RefreshTokenRequest,
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
async def signup(req: SignupRequest, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(
        select(User).where((User.username == req.username) | (User.email == req.email))
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Username or email already exists")

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
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
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
    await db.commit()

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
    access_token = create_access_token(user.id, user.role.value)
    refresh_token = create_refresh_token(user.id, user.role.value)
    return LoginResponse(
        access_token=access_token, refresh_token=refresh_token, user=profile
    )


@router.post("/password/reset/request")
async def password_reset_request(
    req: PasswordResetRequest, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(User).where(User.email == req.email))
    user = result.scalar_one_or_none()
    if not user:
        return {"status": "accepted"}

    import secrets

    token = secrets.token_urlsafe(32)
    token_hash = hash_password(token)
    reset_token = PasswordResetToken(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
    )
    db.add(reset_token)
    await db.commit()

    await send_password_reset_email(user.email, token)

    return {"status": "accepted"}


@router.post("/password/reset/confirm")
async def password_reset_confirm(
    req: PasswordResetConfirm, db: AsyncSession = Depends(get_db)
):
    tokens = await db.execute(
        select(PasswordResetToken).order_by(PasswordResetToken.created_at.desc())
    )
    for token_record in tokens.scalars():
        if verify_password(req.token, token_record.token_hash):
            if token_record.used_at:
                raise HTTPException(status_code=400, detail="Token already used")

            expires = token_record.expires_at
            if datetime.now(timezone.utc) > expires:
                raise HTTPException(status_code=400, detail="Token expired")

            result = await db.execute(
                select(User).where(User.id == token_record.user_id)
            )
            user = result.scalar_one_or_none()
            if not user:
                raise HTTPException(status_code=404, detail="User not found")

            user.password_hash = hash_password(req.new_password)
            token_record.used_at = datetime.now(timezone.utc)
            await db.commit()
            return {"status": "success"}

    raise HTTPException(status_code=400, detail="Invalid token")


@router.post("/refresh")
async def refresh_token(req: RefreshTokenRequest, db: AsyncSession = Depends(get_db)):
    from jose import jwt, JWTError
    from app.config import settings

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

        access_token = create_access_token(user.id, user.role.value)
        refresh_token = create_refresh_token(user.id, user.role.value)
        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
        }
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")


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
