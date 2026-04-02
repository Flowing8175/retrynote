import apiClient from './client';
import type {
  ObjectionCreate,
  ObjectionResponse,
  ObjectionDetail,
} from '@/types';

export const objectionsApi = {
  createObjection: async (
    sessionId: string,
    itemId: string,
    data: ObjectionCreate
  ): Promise<ObjectionResponse> => {
    const response = await apiClient.post<ObjectionResponse>(
      `/quiz-sessions/${sessionId}/items/${itemId}/objections`,
      data
    );
    return response.data;
  },

  getObjection: async (objectionId: string): Promise<ObjectionDetail> => {
    const response = await apiClient.get<ObjectionDetail>(`/objections/${objectionId}`);
    return response.data;
  },
};
