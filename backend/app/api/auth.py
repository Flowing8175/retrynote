import logging
import secrets
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
import jwt
from jwt import InvalidTokenError as JWTError
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timedelta, timezone

from app.config import settings
from app.database import get_db
from app.models.user import User
from app.models.search import PasswordResetToken, RefreshToken, EmailVerificationToken
from app.rate_limit import limiter, _get_real_client_ip
from app.schemas.auth import (
    SignupRequest,
    SignupResponse,
    LoginRequest,
    LoginResponse,
    PasswordResetRequest,
    PasswordResetConfirm,
    EmailVerificationRequest,
    ResendVerificationRequest,
    UserProfile,
    RefreshTokenRequest,
    DeleteAccountRequest,
    ConvertGuestRequest,
)
from app.middleware.auth import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    get_current_user,
)
from app.utils.email import send_password_reset_email, send_verification_email
from app.utils.disposable_email import is_disposable_email
from app.utils.turnstile import verify_turnstile_token

router = APIRouter()
logger = logging.getLogger(__name__)


async def _handle_existing_user_conflict(
    db: AsyncSession,
    existing_user: "User",
    req: "SignupRequest",
) -> None:
    """Handle signup when a user with the same email or username already exists.

    - Unverified + matching email + active token → raise 409 (check email).
    - Unverified + matching email + expired tokens → delete old account, fall through.
    - Otherwise → raise 409.
    """
    if not existing_user.email_verified and existing_user.email == req.email:
        active_token_result = await db.execute(
            select(EmailVerificationToken).where(
                EmailVerificationToken.user_id == existing_user.id,
                EmailVerificationToken.expires_at > datetime.now(timezone.utc),
                EmailVerificationToken.used_at.is_(None),
            )
        )
        if active_token_result.scalars().first():
            raise HTTPException(
                status_code=409,
                detail="인증 대기중입니다. 이메일을 확인해 주세요.",
            )
        else:
            try:
                await db.execute(
                    delete(EmailVerificationToken).where(
                        EmailVerificationToken.user_id == existing_user.id
                    )
                )
                await db.delete(existing_user)
                await db.commit()
            except Exception:
                await db.rollback()
                raise HTTPException(
                    status_code=409,
                    detail="이미 가입되어 있는 계정입니다. 다시 시도해주세요.",
                )
        return  # fall through to create new user

    if existing_user.email == req.email:
        raise HTTPException(
            status_code=409,
            detail="이미 가입되어 있는 이메일입니다.",
        )
    raise HTTPException(
        status_code=409,
        detail="이미 사용 중인 사용자 이름입니다.",
    )


async def _issue_verification_token(db: AsyncSession, user: "User") -> str:
    """Create and persist an email verification token. Returns the raw token string."""
    token = secrets.token_urlsafe(32)
    selector = token[:16]
    verifier = token[16:]
    verifier_hash = hash_password(verifier)
    verification_token = EmailVerificationToken(
        user_id=user.id,
        selector=selector,
        token_hash=verifier_hash,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=24),
    )
    db.add(verification_token)
    return token


@router.post("/signup", response_model=SignupResponse)
@limiter.limit("5/minute")
async def signup(
    request: Request, req: SignupRequest, db: AsyncSession = Depends(get_db)
):
    client_ip = _get_real_client_ip(request)

    if not await verify_turnstile_token(req.turnstile_token, client_ip):
        raise HTTPException(
            status_code=400,
            detail="보안 인증에 실패했습니다. 페이지를 새로고침하세요.",
        )

    if is_disposable_email(req.email):
        raise HTTPException(
            status_code=400,
            detail="해당 이메일 도메인은 사용할 수 없습니다.",
        )

    existing = await db.execute(
        select(User).where(
            ((User.username == req.username) | (User.email == req.email)),
            User.deleted_at.is_(None),
        )
    )
    existing_user = existing.scalar_one_or_none()
    if existing_user:
        await _handle_existing_user_conflict(db, existing_user, req)

    smtp_configured = bool(settings.smtp_host and settings.smtp_user)

    user = User(
        username=req.username,
        email=req.email,
        password_hash=hash_password(req.password),
        email_verified=not smtp_configured,
        signup_ip=client_ip,
    )
    db.add(user)
    try:
        await db.flush()
    except Exception:
        await db.rollback()
        raise HTTPException(
            status_code=409,
            detail="이미 가입되어 있는 계정입니다. 다시 시도해주세요.",
        )

    token: str | None = None
    if smtp_configured:
        token = await _issue_verification_token(db, user)

    await db.commit()
    await db.refresh(user)

    if smtp_configured and token:
        try:
            await send_verification_email(user.email, token)
        except Exception:
            logger.warning("Failed to send verification email to %s", user.email)

    return SignupResponse(
        user_id=user.id, username=user.username, created_at=user.created_at
    )


@router.post("/convert-guest", response_model=LoginResponse)
@limiter.limit("5/minute")
async def convert_guest(
    request: Request, req: ConvertGuestRequest, db: AsyncSession = Depends(get_db)
):
    client_ip = _get_real_client_ip(request)

    if not await verify_turnstile_token(req.turnstile_token, client_ip):
        raise HTTPException(
            status_code=400,
            detail="보안 인증에 실패했습니다. 페이지를 새로고침하세요.",
        )

    if is_disposable_email(req.email):
        raise HTTPException(
            status_code=400,
            detail="해당 이메일 도메인은 사용할 수 없습니다.",
        )

    existing = await db.execute(
        select(User).where(
            ((User.username == req.username) | (User.email == req.email)),
            User.deleted_at.is_(None),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="이미 가입되어 있는 계정입니다.")

    from app.services.guest_session_service import GuestSessionService
    from app.services.guest_conversion_service import GuestConversionService

    guest = await GuestSessionService.get_guest_session(db, req.guest_session_id)
    if not guest:
        raise HTTPException(status_code=404, detail="게스트 세션을 찾을 수 없습니다.")
    if guest.converted_user_id:
        raise HTTPException(status_code=409, detail="이미 전환된 게스트 세션입니다.")

    user = User(
        username=req.username,
        email=req.email,
        password_hash=hash_password(req.password),
        email_verified=False,
        signup_ip=client_ip,
    )
    db.add(user)
    try:
        await db.flush()
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=409, detail="계정 생성에 실패했습니다.")

    await GuestConversionService.convert_guest_to_user(db, guest.id, user.id)
    await GuestSessionService.mark_converted(db, req.guest_session_id, user.id)

    smtp_configured = bool(settings.smtp_host and settings.smtp_user)
    verification_token: str | None = None
    if smtp_configured:
        verification_token = await _issue_verification_token(db, user)

    await db.commit()
    await db.refresh(user)

    if smtp_configured and verification_token:
        try:
            await send_verification_email(user.email, verification_token)
        except Exception:
            logger.warning("Failed to send verification email to %s", user.email)

    jti = str(uuid.uuid4())
    access_token = create_access_token(user.id, user.role.value)
    refresh_token_value = create_refresh_token(user.id, user.role.value, jti=jti)
    db.add(
        RefreshToken(
            id=jti,
            user_id=user.id,
            expires_at=datetime.now(timezone.utc)
            + timedelta(days=settings.refresh_token_expire_days),
        )
    )
    await db.commit()

    try:
        await GuestConversionService.move_guest_files(db, guest.id, user.id)
    except Exception:
        logger.warning("Failed to move guest files for user %s", user.id)

    return LoginResponse(
        access_token=access_token,
        refresh_token=refresh_token_value,
        user=UserProfile(
            id=user.id,
            username=user.username,
            email=user.email,
            role=user.role.value,
            tier=user.tier,
            is_active=user.is_active,
            email_verified=user.email_verified,
            storage_used_bytes=user.storage_used_bytes,
            storage_quota_bytes=user.storage_quota_bytes,
            last_login_at=user.last_login_at,
        ),
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
    if not user.email_verified:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "email_not_verified",
                "message": "이메일 인증이 필요합니다. 받은 편지함을 확인하세요.",
            },
        )

    user.last_login_at = datetime.now(timezone.utc)

    profile = UserProfile(
        id=user.id,
        username=user.username,
        email=user.email,
        role=user.role.value,
        tier=user.tier,
        is_active=user.is_active,
        email_verified=user.email_verified,
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

    try:
        await send_password_reset_email(user.email, token)
    except Exception:
        logger.warning("Failed to send password reset email to %s", user.email)

    return {"status": "accepted"}


@router.post("/resend-verification")
@limiter.limit("3/hour")
async def resend_verification(
    request: Request, req: ResendVerificationRequest, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(User).where(User.email == req.email))
    user = result.scalar_one_or_none()
    if not user or user.email_verified:
        return {"status": "accepted"}

    await db.execute(
        delete(EmailVerificationToken).where(
            EmailVerificationToken.user_id == user.id,
            EmailVerificationToken.used_at.is_(None),
        )
    )

    token = secrets.token_urlsafe(32)
    selector = token[:16]
    verifier = token[16:]
    verifier_hash = hash_password(verifier)
    verification_token = EmailVerificationToken(
        user_id=user.id,
        selector=selector,
        token_hash=verifier_hash,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=24),
    )
    db.add(verification_token)
    await db.commit()

    try:
        await send_verification_email(user.email, token)
    except Exception:
        logger.warning("Failed to send verification email to %s", user.email)

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

    # Revoke all existing refresh tokens so old sessions cannot persist after a reset
    active_tokens = await db.execute(
        select(RefreshToken).where(
            RefreshToken.user_id == user.id,
            RefreshToken.revoked_at.is_(None),
        )
    )
    for rt in active_tokens.scalars().all():
        rt.revoked_at = datetime.now(timezone.utc)

    await db.commit()
    return {"status": "success"}


@router.post("/verify-email")
@limiter.limit("10/minute")
async def verify_email(
    request: Request, req: EmailVerificationRequest, db: AsyncSession = Depends(get_db)
):
    selector = req.token[:16]
    verifier = req.token[16:]

    result = await db.execute(
        select(EmailVerificationToken).where(
            EmailVerificationToken.selector == selector
        )
    )
    token_record = result.scalar_one_or_none()
    if not token_record:
        raise HTTPException(status_code=400, detail="Invalid token")
    if token_record.used_at:
        return {"status": "already_verified"}
    if datetime.now(timezone.utc) > token_record.expires_at:
        raise HTTPException(status_code=400, detail="Token expired")
    if not verify_password(verifier, token_record.token_hash):
        raise HTTPException(status_code=400, detail="Invalid token")

    user_result = await db.execute(select(User).where(User.id == token_record.user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=400,
            detail="인증 링크가 만료되었습니다. 다시 가입해 주세요.",
        )

    token_record.used_at = datetime.now(timezone.utc)
    user.email_verified = True
    await db.commit()

    return {"status": "verified"}


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
                select(RefreshToken)
                .where(RefreshToken.id == jti, RefreshToken.revoked_at.is_(None))
                .with_for_update()
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
        tier=user.tier,
        is_active=user.is_active,
        email_verified=user.email_verified,
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
