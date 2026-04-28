import apiClient from './client';
import type {
  FileUploadResponse,
  FileDetail,
  FileListResponse,
  FileRetryResponse,
  FileFolder,
  ApiStatusResponse,
} from '@/types';

const decodeDownloadName = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export type TopicDepth = 'brief' | 'standard' | 'deep';

export interface UploadFileOptions {
  onUploadProgress?: (percent: number, loaded: number, total: number) => void;
  signal?: AbortSignal;
  topic?: string | null;
  topicDepth?: TopicDepth | null;
}

export const filesApi = {
  uploadFile: async (
    file: File | null,
    manualText: string | null,
    sourceUrl: string | null,
    folderId: string | null = null,
    options: UploadFileOptions = {}
  ): Promise<FileUploadResponse> => {
    const formData = new FormData();
    if (file) {
      formData.append('file', file);
    }
    if (manualText) {
      formData.append('manual_text', manualText);
    }
    if (sourceUrl) {
      formData.append('source_url', sourceUrl);
    }
    if (options.topic) {
      formData.append('topic', options.topic);
    }
    if (options.topicDepth) {
      formData.append('topic_depth', options.topicDepth);
    }
    if (folderId) {
      formData.append('folder_id', folderId);
    }

    const response = await apiClient.post<FileUploadResponse>('/files', formData, {
      signal: options.signal,
      onUploadProgress: options.onUploadProgress
        ? (event) => {
            const total = event.total ?? (file ? file.size : 0);
            const loaded = event.loaded ?? 0;
            const percent = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
            options.onUploadProgress?.(percent, loaded, total);
          }
        : undefined,
    });
    return response.data;
  },

  listFiles: async (
    page: number = 1,
    size: number = 20,
    folderId?: string | null,
    statusFilter?: string | null
  ): Promise<FileListResponse> => {
    const params: Record<string, string | number> = { page, size };
    if (folderId) params.folder_id = folderId;
    if (statusFilter) params.status = statusFilter;

    const response = await apiClient.get<FileListResponse>('/files', { params });
    return response.data;
  },

  getFile: async (fileId: string): Promise<FileDetail> => {
    const response = await apiClient.get<FileDetail>(`/files/${fileId}`);
    return response.data;
  },

  retryFile: async (fileId: string): Promise<FileRetryResponse> => {
    const response = await apiClient.post<FileRetryResponse>(`/files/${fileId}/retry`);
    return response.data;
  },

  deleteFile: async (fileId: string): Promise<ApiStatusResponse> => {
    const response = await apiClient.delete<ApiStatusResponse>(`/files/${fileId}`);
    return response.data;
  },

  renameFile: async (fileId: string, newName: string): Promise<FileDetail> => {
    const response = await apiClient.patch<FileDetail>(`/files/${fileId}`, {
      original_filename: newName,
    });
    return response.data;
  },

  moveFile: async (fileId: string, folderId: string | null): Promise<FileDetail> => {
    const response = await apiClient.post<FileDetail>(`/files/${fileId}/move`, {
      folder_id: folderId,
    });
    return response.data;
  },

  downloadFile: async (fileId: string): Promise<void> => {
    const response = await apiClient.get(`/files/${fileId}/download`, {
      responseType: 'blob',
    });

    const blobUrl = window.URL.createObjectURL(response.data);
    const anchor = document.createElement('a');
    anchor.href = blobUrl;
    const contentDisposition = response.headers['content-disposition'] as string | undefined;
    const filenameMatch = contentDisposition?.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
    const downloadName = decodeDownloadName((filenameMatch?.[1] ?? fileId).replace(/"/g, ''));
    anchor.download = downloadName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(blobUrl);
  },

  listFolders: async (): Promise<FileFolder[]> => {
    const response = await apiClient.get<FileFolder[]>('/files/folders');
    return response.data;
  },

  createFolder: async (name: string): Promise<FileFolder> => {
    const response = await apiClient.post<FileFolder>('/files/folders', { name });
    return response.data;
  },

  deleteFolder: async (folderId: string): Promise<ApiStatusResponse> => {
    const response = await apiClient.delete<ApiStatusResponse>(`/files/folders/${folderId}`);
    return response.data;
  },
};
