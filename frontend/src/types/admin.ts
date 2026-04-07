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

export interface SystemHealthComponent {
  status: 'ok' | 'degraded' | 'down';
  latency_ms: number | null;
  detail: string | null;
}

export interface SystemHealthResponse {
  status: 'ok' | 'degraded' | 'down';
  checked_at: string;
  components: Record<string, SystemHealthComponent>;
  stats: {
    total_users: number;
    active_users: number;
    errors_24h: number;
    total_logs_24h: number;
    error_rate_pct: number;
    pending_jobs: number;
    failed_jobs_24h: number;
  };
}

export interface AdminTopUserByStorage {
  id: string;
  username: string;
  storage_used_bytes: number;
}

export interface AdminAiTokenUsage {
  model: string;
  input_tokens: number;
  output_tokens: number;
}

export interface AdminTopError {
  event_type: string;
  count: number;
}

export interface AdminJobQueueItem {
  status: string;
  job_type: string;
  count: number;
}

export interface AdminDashboardKPIs {
  quizzes_today: number;
  total_quiz_jobs: number;
  total_storage_bytes: number;
  top_users_by_storage: AdminTopUserByStorage[];
  ai_token_usage: AdminAiTokenUsage[];
  top_errors: AdminTopError[];
  signups_7d: number;
  dau: number;
  job_queue: AdminJobQueueItem[];
}

export interface AdminJobItem {
  id: string;
  job_type: string;
  status: string;
  target_type: string | null;
  target_id: string | null;
  error_message: string | null;
  retry_count: number;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface AdminJobListResponse {
  jobs: AdminJobItem[];
  total: number;
}

export interface AdminDbTableInfo {
  name: string;
  row_estimate: number;
  total_size: string;
}

export interface AdminDbDiagnostics {
  tables: AdminDbTableInfo[];
  migration_version: string;
  db_total_size: string;
  checked_at: string;
}

export interface AdminFileStatusBreakdown {
  status: string;
  count: number;
  latest_started: string | null;
  latest_finished: string | null;
}

export interface AdminFileInProgress {
  id: string;
  original_filename: string;
  status: string;
  user_id: string;
  username: string;
  processing_started_at: string | null;
  retry_count: number;
}

export interface AdminFileFailure {
  id: string;
  original_filename: string;
  status: string;
  user_id: string;
  username: string;
  parse_error_code: string | null;
  processing_finished_at: string | null;
}

export interface AdminFilePipelineResponse {
  status_breakdown: AdminFileStatusBreakdown[];
  in_progress: AdminFileInProgress[];
  recent_failures: AdminFileFailure[];
}

export interface AdminRateLimitEvent {
  client_ip: string | null;
  path: string | null;
  event_count: number;
  latest_event: string;
}

export interface AdminRateLimitResponse {
  events: AdminRateLimitEvent[];
  total_events_24h: number;
  unique_ips_count: number;
  top_paths: Array<{ path: string; count: number }>;
}

export interface AdminUserStatusUpdate {
  is_active: boolean;
}

export interface AdminUserRoleUpdate {
  new_role: 'user' | 'admin' | 'super_admin';
}

export interface AdminUserItemWithRole extends AdminUserItem {
  role: string;
}
