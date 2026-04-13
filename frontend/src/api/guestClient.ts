import { useGuestStore } from '@/stores/guestStore';
import type {
  GuestQuizSession,
  GuestQuizItem,
  GuestAnswerResult,
  GuestQuizResults,
  GuestFileUpload,
} from '@/types/guest';
import { createApiClient } from './createApiClient';

const guestClient = createApiClient();

let _turnstileToken = '';
export const setGuestTurnstileToken = (token: string) => {
  _turnstileToken = token;
};

guestClient.interceptors.request.use((config) => {
  const { guestSessionId } = useGuestStore.getState();
  if (guestSessionId && config.headers) {
    config.headers['X-Guest-Session'] = guestSessionId;
  }
  if (_turnstileToken && config.headers) {
    config.headers['X-Turnstile-Token'] = _turnstileToken;
  }
  return config;
});

export const guestApi = {
  createQuizSession: async (data: {
    topic?: string;
    manual_text?: string;
    question_count?: number;
    difficulty?: string;
    selected_file_ids?: string[];
  }): Promise<{ session_id: string; status: string }> => {
    const response = await guestClient.post('/public/quiz-sessions', data);
    return response.data;
  },

  getQuizSession: async (sessionId: string): Promise<GuestQuizSession> => {
    const response = await guestClient.get(`/public/quiz-sessions/${sessionId}`);
    return response.data;
  },

  getQuizItems: async (sessionId: string): Promise<GuestQuizItem[]> => {
    const response = await guestClient.get(`/public/quiz-sessions/${sessionId}/items`);
    return response.data;
  },

  submitAnswer: async (
    sessionId: string,
    itemId: string,
    data: { user_answer: string }
  ): Promise<GuestAnswerResult> => {
    const response = await guestClient.post(
      `/public/quiz-sessions/${sessionId}/items/${itemId}/answer`,
      data
    );
    return response.data;
  },

  getQuizResults: async (sessionId: string): Promise<GuestQuizResults> => {
    const response = await guestClient.get(`/public/quiz-sessions/${sessionId}/results`);
    return response.data;
  },

  uploadFile: async (formData: FormData): Promise<GuestFileUpload> => {
    const response = await guestClient.post('/public/files', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  listFiles: async (): Promise<GuestFileUpload[]> => {
    const response = await guestClient.get('/public/files');
    return response.data;
  },
};

export default guestClient;
