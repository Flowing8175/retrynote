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
    const searchParams = new URLSearchParams();
    searchParams.set('sort', sort);
    searchParams.set('page', String(page));
    searchParams.set('size', String(size));
    if (judgement && judgement.length > 0) {
      judgement.forEach((j) => searchParams.append('judgement', j));
    }
    if (errorType && errorType.length > 0) {
      errorType.forEach((e) => searchParams.append('error_type', e));
    }
    if (fileId) searchParams.set('file_id', fileId);
    if (categoryTag) searchParams.set('category_tag', categoryTag);

    const response = await apiClient.get<WrongNoteListResponse>(
      `/wrong-notes?${searchParams.toString()}`
    );
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
