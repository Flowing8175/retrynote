from pydantic import BaseModel, ConfigDict, EmailStr
from datetime import datetime


class SignupRequest(BaseModel):
    username: str
    email: EmailStr
    password: str


class SignupResponse(BaseModel):
    user_id: str
    username: str
    created_at: datetime


class LoginRequest(BaseModel):
    username_or_email: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: "UserProfile"


class UserProfile(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    username: str
    email: str
    role: str
    is_active: bool
    storage_used_bytes: int
    storage_quota_bytes: int
    last_login_at: datetime | None = None


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str


class TokenPayload(BaseModel):
    sub: str
    role: str
    exp: int
    type: str  # access | refresh | admin


class RefreshTokenRequest(BaseModel):
    refresh_token: str
