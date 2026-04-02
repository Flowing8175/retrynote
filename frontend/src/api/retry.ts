import apiClient from './client';
import type {
  RetrySetCreate,
  RetrySetResponse,
} from '@/types';

export const retryApi = {
  createRetrySet: async (data: RetrySetCreate): Promise<RetrySetResponse> => {
    const response = await apiClient.post<RetrySetResponse>('/retry-sets', data);
    return response.data;
  },
};
