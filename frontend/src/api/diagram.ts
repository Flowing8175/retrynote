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

export const DIAGRAM_TYPES = [
  { value: 'flowchart', label: '흐름도' },
  { value: 'mindmap', label: '마인드맵' },
  { value: 'stateDiagram', label: '상태도' },
  { value: 'classDiagram', label: '클래스도' },
] as const;

export type DiagramTypeValue = typeof DIAGRAM_TYPES[number]['value'];

export const diagramApi = {
  generateDiagram: async (
    conceptKey: string,
    force: boolean = false,
    signal?: AbortSignal,
    diagramType?: DiagramTypeValue,
  ): Promise<DiagramResponse> => {
    const response = await apiClient.post<DiagramResponse>(
      '/diagrams/generate',
      { concept_key: conceptKey, force, diagram_type: diagramType ?? null },
      { signal, _skipUpgradeModal: true } as object,
    );
    return response.data;
  },

  getCachedDiagram: async (
    conceptKey: string,
    signal?: AbortSignal,
    diagramType?: DiagramTypeValue,
  ): Promise<DiagramResponse> => {
    const params = diagramType ? { diagram_type: diagramType } : undefined;
    const response = await apiClient.get<DiagramResponse>(
      `/diagrams/${encodeURIComponent(conceptKey)}`,
      { signal, params },
    );
    return response.data;
  },
};
