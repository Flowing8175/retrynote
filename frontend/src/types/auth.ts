export interface SignupRequest {
  username: string;
  email: string;
  password: string;
  turnstile_token?: string;
}

export interface SignupResponse {
  user_id: string;
  username: string;
  created_at: string;
}

export interface LoginRequest {
  username_or_email: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: UserProfile;
}

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  role: string;
  is_active: boolean;
  email_verified: boolean;
  storage_used_bytes: number;
  storage_quota_bytes: number;
  last_login_at: string | null;
}

export interface PasswordResetRequest {
  email: string;
}

export interface PasswordResetConfirm {
  token: string;
  new_password: string;
}

export interface RefreshTokenRequest {
  refresh_token: string;
}

export interface DeleteAccountRequest {
  password: string;
}

export interface EmailVerificationRequest {
  token: string;
}

export interface ResendVerificationRequest {
  email: string;
}
