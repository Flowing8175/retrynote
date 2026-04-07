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

  endImpersonation: async (impersonationId: string): Promise<{ status: string }> => {
    const response = await apiClient.post<{ status: string }>(`/admin/impersonation/${impersonationId}/end`);
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
      active_grading_model: string | null;
      fallback_generation_model: string | null;
      fallback_grading_model: string | null;
    };
  }> => {
    const response = await apiClient.post<{
      status: string;
      settings: {
        active_generation_model: string | null;
        active_grading_model: string | null;
        fallback_generation_model: string | null;
        fallback_grading_model: string | null;
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

  getAuditLogs: async (
    page: number = 1,
    size: number = 20
  ): Promise<{ logs: AdminAuditLogItem[]; total: number }> => {
    const response = await apiClient.get<{ logs: AdminAuditLogItem[]; total: number }>('/admin/audit-logs', { params: { page, size } });
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

  retryJob: async (jobId: string): Promise<{ status: string }> => {
    const response = await apiClient.post<{ status: string }>(`/admin/jobs/${jobId}/retry`);
    return response.data;
  },

  cancelJob: async (jobId: string): Promise<{ status: string }> => {
    const response = await apiClient.post<{ status: string }>(`/admin/jobs/${jobId}/cancel`);
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

  toggleUserStatus: async (userId: string, data: AdminUserStatusUpdate): Promise<{ status: string }> => {
    const response = await apiClient.patch<{ status: string }>(`/admin/users/${userId}/status`, data);
    return response.data;
  },

  changeUserRole: async (userId: string, data: AdminUserRoleUpdate): Promise<{ status: string }> => {
    const response = await apiClient.patch<{ status: string }>(`/admin/users/${userId}/role`, data);
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
