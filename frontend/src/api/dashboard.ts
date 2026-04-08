import apiClient from './client';
import type {
  DashboardResponse,
} from '@/types';

export const dashboardApi = {
  getDashboard: async (
    range: string = '7d',
    fileId?: string | null,
    categoryTag?: string | null
  ): Promise<DashboardResponse> => {
    const params: Record<string, string> = { range };
    if (fileId) params.file_id = fileId;
    if (categoryTag) params.category_tag = categoryTag;

    const response = await apiClient.get<DashboardResponse>('/dashboard', { params });
    return response.data;
  },
};
