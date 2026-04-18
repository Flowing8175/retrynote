import apiClient from './client';
import type {
  SavedPrompt,
  SavedPromptCreate,
  SavedPromptUpsert,
} from '@/types';

export const savedPromptsApi = {
  list: async (): Promise<SavedPrompt[]> => {
    const response = await apiClient.get<SavedPrompt[]>('/saved-prompts');
    return response.data;
  },

  create: async (data: SavedPromptCreate): Promise<SavedPrompt> => {
    const response = await apiClient.post<SavedPrompt>('/saved-prompts', data);
    return response.data;
  },

  upsert: async (slot: number, data: SavedPromptUpsert): Promise<SavedPrompt> => {
    const response = await apiClient.put<SavedPrompt>(
      `/saved-prompts/${slot}`,
      data
    );
    return response.data;
  },

  remove: async (slot: number): Promise<void> => {
    await apiClient.delete(`/saved-prompts/${slot}`);
  },
};
