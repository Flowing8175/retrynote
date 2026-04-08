import apiClient from './client';
import { useAuthStore } from '@/stores/authStore';
import type {
  DashboardResponse,
} from '@/types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

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

  streamCoaching: (
    range: string = '7d',
    fileId?: string | null,
    categoryTag?: string | null,
    onChunk?: (text: string) => void,
    onDone?: () => void,
    onError?: (error: Error) => void,
  ): (() => void) => {
    const params = new URLSearchParams({ range });
    if (fileId) params.set('file_id', fileId);
    if (categoryTag) params.set('category_tag', categoryTag);

    const { accessToken } = useAuthStore.getState();
    const controller = new AbortController();

    (async () => {
      try {
        const response = await fetch(
          `${API_BASE_URL}/dashboard/coaching-stream?${params}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
            signal: controller.signal,
          },
        );

        if (!response.ok || !response.body) {
          throw new Error(`HTTP ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split('\n\n');
          buffer = events.pop() || '';

          for (const event of events) {
            const dataLines: string[] = [];
            for (const line of event.split('\n')) {
              if (line.startsWith('data: ')) {
                dataLines.push(line.slice(6));
              }
            }
            if (dataLines.length === 0) continue;
            const payload = dataLines.join('\n');
            if (payload === '[DONE]') {
              onDone?.();
              return;
            }
            onChunk?.(payload);
          }
        }
        onDone?.();
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          onError?.(err as Error);
        }
      }
    })();

    return () => controller.abort();
  },
};
