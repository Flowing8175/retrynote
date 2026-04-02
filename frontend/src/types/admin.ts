export interface MasterPasswordVerify {
  master_password: string;
}

export interface AdminUserItem {
  id: string;
  username: string;
  email: string;
  created_at: string;
  storage_used_bytes: number;
  last_login_at: string | null;
  is_active: boolean;
}

export interface AdminUserListResponse {
  users: AdminUserItem[];
  total: number;
}

export interface AdminLogQuery {
  page: number;
  size: number;
  level: string | null;
  service_name: string | null;
  event_type: string | null;
  date_from: string | null;
  date_to: string | null;
}

export interface AdminLogItem {
  id: string;
  level: string;
  service_name: string;
  event_type: string;
  message: string;
  meta_json: Record<string, unknown> | null;
  trace_id: string | null;
  created_at: string;
}

export interface AdminLogResponse {
  logs: AdminLogItem[];
  total: number;
}

export interface ModelUsageItem {
  model_name: string;
  request_count: number;
  input_tokens: number;
  output_tokens: number;
  failure_count: number;
  fallback_count: number;
}

export interface ModelUsageResponse {
  usage: ModelUsageItem[];
}

export interface ImpersonationStart {
  target_user_id: string;
  reason: string;
}

export interface ImpersonationResponse {
  impersonation_id: string;
  target_user_id: string;
  target_username: string;
}

export interface RegradeRequest {
  reason: string;
}

export interface RegradeResponse {
  regrade_job_id: string;
}

export interface ModelSettingsUpdate {
  active_generation_model: string | null;
  active_grading_model: string | null;
  fallback_generation_model: string | null;
  fallback_grading_model: string | null;
}

export interface AnnouncementCreate {
  title: string;
  body: string;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
}

export interface AnnouncementResponse {
  id: string;
  title: string;
  body: string;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
}

export interface AdminAuditLogItem {
  id: string;
  admin_user_id: string;
  target_user_id: string | null;
  action_type: string;
  target_type: string | null;
  target_id: string | null;
  reason: string | null;
  payload_json: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}
