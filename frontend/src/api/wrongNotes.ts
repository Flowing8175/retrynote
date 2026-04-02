import apiClient from './client';
import type {
  WrongNoteListResponse,
  WrongNoteErrorTypeUpdate,
} from '@/types';

export const wrongNotesApi = {
  listWrongNotes: async (
    sort: string = 'concept',
    judgement?: string[],
    errorType?: string[],
    fileId?: string | null,
    categoryTag?: string | null,
    page: number = 1,
    size: number = 20
  ): Promise<WrongNoteListResponse> => {
    const params: Record<string, string | number | string[]> = { sort, page, size };
    if (judgement && judgement.length > 0) params.judgement = judgement;
    if (errorType && errorType.length > 0) params.error_type = errorType;
    if (fileId) params.file_id = fileId;
    if (categoryTag) params.category_tag = categoryTag;

    const response = await apiClient.get<WrongNoteListResponse>('/wrong-notes', { params });
    return response.data;
  },

  updateErrorType: async (
    answerLogId: string,
    data: WrongNoteErrorTypeUpdate
  ): Promise<{ status: string }> => {
    const response = await apiClient.patch<{ status: string }>(
      `/wrong-notes/${answerLogId}/error-type`,
      data
    );
    return response.data;
  },
};
