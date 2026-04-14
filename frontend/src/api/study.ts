import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from './client';
import type {
  StudyStatus,
  StudySummary,
  StudyFlashcardSet,
  StudyMindmap,
  StudyChatHistory,
  StudyContentType,
} from '@/types/study';

export const studyApi = {
  getStatus: async (fileId: string): Promise<StudyStatus> => {
    const response = await apiClient.get<StudyStatus>(`/study/${fileId}/status`);
    return response.data;
  },

  getSummary: async (fileId: string): Promise<StudySummary> => {
    const response = await apiClient.get<StudySummary>(`/study/${fileId}/summary`);
    return response.data;
  },

  getFlashcards: async (fileId: string): Promise<StudyFlashcardSet> => {
    const response = await apiClient.get<StudyFlashcardSet>(`/study/${fileId}/flashcards`);
    return response.data;
  },

  getMindmap: async (fileId: string): Promise<StudyMindmap> => {
    const response = await apiClient.get<StudyMindmap>(`/study/${fileId}/mindmap`);
    return response.data;
  },

  generateContent: async (fileId: string, type: StudyContentType, forceRegenerate = false): Promise<{ status: string }> => {
    const response = await apiClient.post<{ status: string }>(
      `/study/${fileId}/${type}/generate`,
      { force_regenerate: forceRegenerate }
    );
    return response.data;
  },

  getChatHistory: async (fileId: string): Promise<StudyChatHistory> => {
    const response = await apiClient.get<StudyChatHistory>(`/study/${fileId}/chat/history`);
    return response.data;
  },
};

export function useStudyStatus(fileId: string) {
  return useQuery({
    queryKey: ['study', 'status', fileId],
    queryFn: () => studyApi.getStatus(fileId),
    enabled: !!fileId,
    retry: (_, error: unknown) => {
      const status = (error as { response?: { status?: number } })?.response?.status;
      return status !== 404 && status !== 403;
    },
  });
}

export function useStudySummary(fileId: string) {
  return useQuery({
    queryKey: ['study', 'summary', fileId],
    queryFn: () => studyApi.getSummary(fileId),
    enabled: !!fileId,
  });
}

export function useStudyFlashcards(fileId: string) {
  return useQuery({
    queryKey: ['study', 'flashcards', fileId],
    queryFn: () => studyApi.getFlashcards(fileId),
    enabled: !!fileId,
  });
}

export function useStudyMindmap(fileId: string) {
  return useQuery({
    queryKey: ['study', 'mindmap', fileId],
    queryFn: () => studyApi.getMindmap(fileId),
    enabled: !!fileId,
  });
}

export function useGenerateContent(fileId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (type: StudyContentType) => studyApi.generateContent(fileId, type),
    onSuccess: (_data, type) => {
      void queryClient.invalidateQueries({ queryKey: ['study', 'status', fileId] });
      void queryClient.invalidateQueries({ queryKey: ['study', type, fileId] });
    },
  });
}

export function useChatHistory(fileId: string) {
  return useQuery({
    queryKey: ['study', 'chat', 'history', fileId],
    queryFn: () => studyApi.getChatHistory(fileId),
    enabled: !!fileId,
  });
}
