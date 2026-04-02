import apiClient from './client';
import type {
  SearchResponse,
} from '@/types';

export const searchApi = {
  search: async (
    q: string,
    scope: string = 'all',
    fileId?: string | null,
    folderId?: string | null,
    page: number = 1,
    size: number = 20
  ): Promise<SearchResponse> => {
    const params: Record<string, string | number> = { q, scope, page, size };
    if (fileId) params.file_id = fileId;
    if (folderId) params.folder_id = folderId;

    const response = await apiClient.get<SearchResponse>('/search', { params });
    return response.data;
  },
};
