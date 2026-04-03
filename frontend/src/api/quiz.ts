import apiClient from './client';
import type {
  QuizSessionCreate,
  QuizSessionResponse,
  QuizSessionDetail,
  QuizSessionHistoryItem,
  QuizItemResponse,
  AnswerSubmit,
  AnswerResponse,
  DraftAnswerSubmit,
  DraftAnswerResponse,
  ExamSubmit,
  ExamSubmitResponse,
} from '@/types';

export const quizApi = {
  createQuizSession: async (data: QuizSessionCreate): Promise<QuizSessionResponse> => {
    const response = await apiClient.post<QuizSessionResponse>('/quiz-sessions', data);
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

  getQuizItems: async (sessionId: string): Promise<QuizItemResponse[]> => {
    const response = await apiClient.get<QuizItemResponse[]>(`/quiz-sessions/${sessionId}/items`);
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

  deleteQuizSession: async (sessionId: string): Promise<void> => {
    await apiClient.delete(`/quiz-sessions/${sessionId}`);
  },
};
