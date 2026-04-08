import apiClient from './client';
import type {
  QuizSessionCreate,
  QuizConfig,
  QuizSessionResponse,
  QuizSessionDetail,
  QuizSessionHistoryItem,
  QuizItemDetail,
  AnswerSubmit,
  AnswerResponse,
  AnswerLogEntry,
  DraftAnswerSubmit,
  DraftAnswerResponse,
  ExamSubmit,
  ExamSubmitResponse,
  SessionCompleteResponse,
} from '@/types';

export const quizApi = {
  createQuizSession: async (data: QuizSessionCreate, signal?: AbortSignal): Promise<QuizSessionResponse> => {
    const response = await apiClient.post<QuizSessionResponse>('/quiz-sessions', data, { signal });
    return response.data;
  },

  getQuizSession: async (sessionId: string): Promise<QuizSessionDetail> => {
    const response = await apiClient.get<QuizSessionDetail>(`/quiz-sessions/${sessionId}`);
    return response.data;
  },

  listQuizSessions: async (limit = 10): Promise<QuizSessionHistoryItem[]> => {
    const response = await apiClient.get<QuizSessionHistoryItem[]>('/quiz-sessions', {
      params: { limit },
    });
    return response.data;
  },

  getQuizItems: async (sessionId: string): Promise<QuizItemDetail[]> => {
    const response = await apiClient.get<QuizItemDetail[]>(`/quiz-sessions/${sessionId}/items`);
    return response.data;
  },

  submitAnswer: async (
    sessionId: string,
    itemId: string,
    data: AnswerSubmit
  ): Promise<AnswerResponse> => {
    const response = await apiClient.post<AnswerResponse>(
      `/quiz-sessions/${sessionId}/items/${itemId}/answer`,
      data
    );
    return response.data;
  },

  saveDraftAnswer: async (
    sessionId: string,
    data: DraftAnswerSubmit
  ): Promise<DraftAnswerResponse> => {
    const response = await apiClient.post<DraftAnswerResponse>(
      `/quiz-sessions/${sessionId}/draft-answer`,
      data
    );
    return response.data;
  },

  submitExam: async (
    sessionId: string,
    data: ExamSubmit
  ): Promise<ExamSubmitResponse> => {
    const response = await apiClient.post<ExamSubmitResponse>(
      `/quiz-sessions/${sessionId}/submit`,
      data
    );
    return response.data;
  },

  completeQuizSession: async (sessionId: string): Promise<SessionCompleteResponse> => {
    const response = await apiClient.post<SessionCompleteResponse>(
      `/quiz-sessions/${sessionId}/complete`
    );
    return response.data;
  },

  getAnswerLogs: async (sessionId: string): Promise<AnswerLogEntry[]> => {
    const response = await apiClient.get<AnswerLogEntry[]>(`/quiz-sessions/${sessionId}/answer-logs`);
    return response.data;
  },

  deleteQuizSession: async (sessionId: string): Promise<void> => {
    await apiClient.delete(`/quiz-sessions/${sessionId}`);
  },

  getQuizConfig: async (): Promise<QuizConfig> => {
    const response = await apiClient.get<QuizConfig>('/quiz-sessions/config');
    return response.data;
  },
};
