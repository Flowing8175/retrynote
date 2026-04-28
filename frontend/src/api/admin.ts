import apiClient from './client';
import type {
  MasterPasswordVerify,
  AdminUserListResponse,
  AdminLogResponse,
  ModelUsageResponse,
  ImpersonationStart,
  ImpersonationResponse,
  RegradeRequest,
  RegradeResponse,
  ModelSettingsUpdate,
  AnnouncementCreate,
  AnnouncementResponse,
  AdminAuditLogItem,
  SystemHealthResponse,
  AdminDbDiagnostics,
  AdminDashboardKPIs,
  AdminJobListResponse,
  AdminFilePipelineResponse,
  AdminRateLimitResponse,
  AdminUserStatusUpdate,
  AdminUserRoleUpdate,
  ApiStatusResponse,
} from '@/types';

export const adminApi = {
  verifyMasterPassword: async (data: MasterPasswordVerify): Promise<{ verified: boolean; admin_token?: string }> => {
    const response = await apiClient.post<{ verified: boolean; admin_token?: string }>('/admin/login/verify-master', data);
    return response.data;
  },

  listUsers: async (
    page: number = 1,
    size: number = 20
  ): Promise<AdminUserListResponse> => {
    const response = await apiClient.get<AdminUserListResponse>('/admin/users', { params: { page, size } });
    return response.data;
  },

  listLogs: async (
    page: number = 1,
    size: number = 20,
    level?: string | null,
    serviceName?: string | null,
    eventType?: string | null
  ): Promise<AdminLogResponse> => {
    const params: Record<string, string | number> = { page, size };
    if (level) params.level = level;
    if (serviceName) params.service_name = serviceName;
    if (eventType) params.event_type = eventType;

    const response = await apiClient.get<AdminLogResponse>('/admin/logs', { params });
    return response.data;
  },

  getModelUsage: async (): Promise<ModelUsageResponse> => {
    const response = await apiClient.get<ModelUsageResponse>('/admin/model-usage');
    return response.data;
  },

  startImpersonation: async (data: ImpersonationStart): Promise<ImpersonationResponse> => {
    const response = await apiClient.post<ImpersonationResponse>('/admin/impersonation/start', data);
    return response.data;
  },

  endImpersonation: async (impersonationId: string): Promise<ApiStatusResponse> => {
    const response = await apiClient.post<ApiStatusResponse>(`/admin/impersonation/${impersonationId}/end`);
    return response.data;
  },

  regradeItem: async (itemId: string, data: RegradeRequest): Promise<RegradeResponse> => {
    const response = await apiClient.post<RegradeResponse>(`/admin/quiz-items/${itemId}/regrade`, data);
    return response.data;
  },

  updateModelSettings: async (data: ModelSettingsUpdate): Promise<{
    status: string;
    settings: {
      active_generation_model: string | null;
      fallback_generation_model: string | null;
    };
  }> => {
    const response = await apiClient.post<{
      status: string;
      settings: {
        active_generation_model: string | null;
        fallback_generation_model: string | null;
      };
    }>('/admin/settings/models', data);
    return response.data;
  },

  listAnnouncements: async (): Promise<AnnouncementResponse[]> => {
    const response = await apiClient.get<AnnouncementResponse[]>('/admin/announcements');
    return response.data;
  },

  createAnnouncement: async (data: AnnouncementCreate): Promise<AnnouncementResponse> => {
    const response = await apiClient.post<AnnouncementResponse>('/admin/announcements', data);
    return response.data;
  },

  deleteAnnouncement: async (id: string): Promise<void> => {
    await apiClient.delete(`/admin/announcements/${id}`);
  },

  getAuditLogs: async (
    page: number = 1,
    size: number = 20,
    filters?: {
      action_type?: string | null;
      admin_user_id?: string | null;
      target_user_id?: string | null;
      date_from?: string | null;
      date_to?: string | null;
    }
  ): Promise<{ logs: AdminAuditLogItem[]; total: number }> => {
    const params: Record<string, string | number> = { page, size };
    if (filters?.action_type) params.action_type = filters.action_type;
    if (filters?.admin_user_id) params.admin_user_id = filters.admin_user_id;
    if (filters?.target_user_id) params.target_user_id = filters.target_user_id;
    if (filters?.date_from) params.date_from = filters.date_from;
    if (filters?.date_to) params.date_to = filters.date_to;
    const response = await apiClient.get<{ logs: AdminAuditLogItem[]; total: number }>('/admin/audit-logs', { params });
    return response.data;
  },

  getSystemHealth: async (): Promise<SystemHealthResponse> => {
    const response = await apiClient.get<SystemHealthResponse>('/admin/system-health');
    return response.data;
  },

  getDbDiagnostics: async (): Promise<AdminDbDiagnostics> => {
    const response = await apiClient.get<AdminDbDiagnostics>('/admin/db-diagnostics');
    return response.data;
  },

  getDashboardKPIs: async (): Promise<AdminDashboardKPIs> => {
    const response = await apiClient.get<AdminDashboardKPIs>('/admin/dashboard-kpis');
    return response.data;
  },

  listJobs: async (
    status?: string,
    jobType?: string,
    page: number = 1,
    size: number = 20
  ): Promise<AdminJobListResponse> => {
    const params: Record<string, string | number> = { page, size };
    if (status) params.status = status;
    if (jobType) params.job_type = jobType;
    const response = await apiClient.get<AdminJobListResponse>('/admin/jobs', { params });
    return response.data;
  },

  retryJob: async (jobId: string): Promise<ApiStatusResponse> => {
    const response = await apiClient.post<ApiStatusResponse>(`/admin/jobs/${jobId}/retry`);
    return response.data;
  },

  cancelJob: async (jobId: string): Promise<ApiStatusResponse> => {
    const response = await apiClient.post<ApiStatusResponse>(`/admin/jobs/${jobId}/cancel`);
    return response.data;
  },

  getFilePipeline: async (): Promise<AdminFilePipelineResponse> => {
    const response = await apiClient.get<AdminFilePipelineResponse>('/admin/files-pipeline');
    return response.data;
  },

  getRateLimits: async (): Promise<AdminRateLimitResponse> => {
    const response = await apiClient.get<AdminRateLimitResponse>('/admin/rate-limits');
    return response.data;
  },

  toggleUserStatus: async (userId: string, data: AdminUserStatusUpdate): Promise<ApiStatusResponse> => {
    const response = await apiClient.patch<ApiStatusResponse>(`/admin/users/${userId}/status`, data);
    return response.data;
  },

  changeUserRole: async (userId: string, data: AdminUserRoleUpdate): Promise<ApiStatusResponse> => {
    const response = await apiClient.patch<ApiStatusResponse>(`/admin/users/${userId}/role`, data);
    return response.data;
  },

  deleteUser: async (userId: string): Promise<ApiStatusResponse> => {
    const response = await apiClient.delete<ApiStatusResponse>(`/admin/users/${userId}`);
    return response.data;
  },

  exportUsers: async (isActive?: boolean): Promise<Blob> => {
    const params: Record<string, string> = {};
    if (isActive !== undefined) params.is_active = String(isActive);
    const response = await apiClient.get('/admin/export/users', { params, responseType: 'blob' });
    return response.data as Blob;
  },

  exportLogs: async (level?: string, serviceName?: string, eventType?: string, dateFrom?: string, dateTo?: string): Promise<Blob> => {
    const params: Record<string, string> = {};
    if (level) params.level = level;
    if (serviceName) params.service_name = serviceName;
    if (eventType) params.event_type = eventType;
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    const response = await apiClient.get('/admin/export/logs', { params, responseType: 'blob' });
    return response.data as Blob;
  },

  exportAuditLogs: async (): Promise<Blob> => {
    const response = await apiClient.get('/admin/export/audit-logs', { responseType: 'blob' });
    return response.data as Blob;
  },
};
