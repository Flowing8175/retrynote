import apiClient from './client';

export interface DiagramResponse {
  concept_key: string;
  concept_label: string;
  diagram_type: string;
  mermaid_code: string;
  title: string;
  cached: boolean;
  created_at: string | null;
}

export const diagramApi = {
  generateDiagram: async (
    conceptKey: string,
    force: boolean = false,
    signal?: AbortSignal,
  ): Promise<DiagramResponse> => {
    const response = await apiClient.post<DiagramResponse>(
      '/diagrams/generate',
      { concept_key: conceptKey, force },
      { signal, _skipUpgradeModal: true } as object,
    );
    return response.data;
  },

  getCachedDiagram: async (
    conceptKey: string,
    signal?: AbortSignal,
  ): Promise<DiagramResponse> => {
    const response = await apiClient.get<DiagramResponse>(
      `/diagrams/${encodeURIComponent(conceptKey)}`,
      { signal },
    );
    return response.data;
  },
};
