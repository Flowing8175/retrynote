import apiClient from './client';
import type {
  RetrySetCreate,
  RetrySetResponse,
} from '@/types';

export const retryApi = {
  createRetrySet: async (data: RetrySetCreate): Promise<RetrySetResponse> => {
    const response = await apiClient.post<RetrySetResponse>('/retry-sets', data, { _skipUpgradeModal: true } as object);
    return response.data;
  },
};
