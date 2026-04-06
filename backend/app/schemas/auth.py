from pydantic import BaseModel, ConfigDict, EmailStr, Field
from datetime import datetime


class SignupRequest(BaseModel):
    username: str = Field(min_length=3, max_length=50, pattern=r"^[a-zA-Z0-9_]+$")
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class SignupResponse(BaseModel):
    user_id: str
    username: str
    created_at: datetime


class LoginRequest(BaseModel):
    username_or_email: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=1, max_length=128)


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
    tier: str
    is_active: bool
    storage_used_bytes: int
    storage_quota_bytes: int
    last_login_at: datetime | None = None


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    token: str = Field(min_length=1, max_length=255)
    new_password: str = Field(min_length=8, max_length=128)


class TokenPayload(BaseModel):
    sub: str
    role: str
    exp: int
    type: str  # access | refresh | admin


class RefreshTokenRequest(BaseModel):
    refresh_token: str = Field(min_length=1, max_length=4096)


class DeleteAccountRequest(BaseModel):
    password: str = Field(min_length=1, max_length=128)
