import apiClient from './client';
import type { GuestQuestion } from '@/stores/guestStore';

export interface GuestQuizResponse {
  topic: string;
  questions: GuestQuestion[];
}

export interface MigrateGuestRequest {
  topic: string;
  questions: GuestQuestion[];
}

export interface MigrateGuestResponse {
  quiz_session_id: string;
}

export const guestApi = {
  generateQuiz: async (topic: string): Promise<GuestQuizResponse> => {
    const response = await apiClient.post<GuestQuizResponse>('/guest', { topic });
    return response.data;
  },

  migrateSession: async (data: MigrateGuestRequest): Promise<MigrateGuestResponse> => {
    const response = await apiClient.post<MigrateGuestResponse>('/auth/migrate-guest', data);
    return response.data;
  },
};
