import apiClient from './client';

export interface PublicAnnouncement {
  id: string;
  title: string;
  body: string;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string | null;
}

export const announcementsApi = {
  listActive: async (): Promise<PublicAnnouncement[]> => {
    const response = await apiClient.get<PublicAnnouncement[]>('/announcements');
    return response.data;
  },
};
