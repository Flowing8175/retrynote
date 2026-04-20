import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from './client';
import type {
  StudyStatus,
  StudySummary,
  StudyFlashcardSet,
  StudyMindmap,
  StudyChatHistory,
  StudyContentType,
  MindmapNodeExplanation,
  StudyHistoryResponse,
  StudyVisitResponse,
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

  getMindmapNodeExplanation: async (
    fileId: string,
    nodeId: string,
    nodeLabel: string,
  ): Promise<MindmapNodeExplanation> => {
    const response = await apiClient.post<MindmapNodeExplanation>(
      `/study/${fileId}/mindmap/node-explanation`,
      { node_id: nodeId, node_label: nodeLabel },
    );
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

  trackVisit: async (fileId: string): Promise<StudyVisitResponse> => {
    const response = await apiClient.post<StudyVisitResponse>(`/study/${fileId}/visit`);
    return response.data;
  },

  getHistory: async (limit = 20): Promise<StudyHistoryResponse> => {
    const response = await apiClient.get<StudyHistoryResponse>(`/study/history`, { params: { limit } });
    return response.data;
  },
};

export function useStudyStatus(fileId: string) {
  return useQuery({
    queryKey: ['study', 'status', fileId],
    queryFn: () => studyApi.getStatus(fileId),
    enabled: !!fileId,
    refetchInterval: (query) => {
      const data = query.state.data as StudyStatus | undefined;
      if (
        data &&
        (data.summary_status === 'generating' ||
          data.flashcards_status === 'generating' ||
          data.mindmap_status === 'generating')
      ) {
        return 3000;
      }
      return false;
    },
    retry: (_, error: unknown) => {
      const status = (error as { response?: { status?: number } })?.response?.status;
      return status !== 404 && status !== 403;
    },
  });
}

export function useStudySummary(fileId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['study', 'summary', fileId],
    queryFn: () => studyApi.getSummary(fileId),
    enabled: (options?.enabled !== false) && !!fileId,
  });
}

export function useStudyFlashcards(fileId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['study', 'flashcards', fileId],
    queryFn: () => studyApi.getFlashcards(fileId),
    enabled: (options?.enabled !== false) && !!fileId,
  });
}

export function useStudyMindmap(fileId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['study', 'mindmap', fileId],
    queryFn: () => studyApi.getMindmap(fileId),
    enabled: (options?.enabled !== false) && !!fileId,
  });
}

export function useMindmapNodeExplanation(
  fileId: string,
  nodeId: string | null,
  nodeLabel: string | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ['study', 'mindmap', fileId, 'node-explanation', nodeId],
    queryFn: () =>
      studyApi.getMindmapNodeExplanation(fileId, nodeId ?? '', nodeLabel ?? ''),
    enabled:
      (options?.enabled !== false) &&
      !!fileId &&
      !!nodeId &&
      !!nodeLabel,
    staleTime: Infinity,
    gcTime: 1000 * 60 * 30,
    retry: (_, error: unknown) => {
      const status = (error as { response?: { status?: number } })?.response?.status;
      return status !== 404 && status !== 403 && status !== 402;
    },
  });
}

export function useGenerateContent(fileId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (type: StudyContentType) => studyApi.generateContent(fileId, type),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['study', 'status', fileId] });
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

export function useStudyHistory(limit = 20, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['study', 'history', limit],
    queryFn: () => studyApi.getHistory(limit),
    enabled: options?.enabled !== false,
    staleTime: 30 * 1000,
  });
}

export function useTrackStudyVisit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (fileId: string) => studyApi.trackVisit(fileId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['study', 'history'] });
    },
  });
}
