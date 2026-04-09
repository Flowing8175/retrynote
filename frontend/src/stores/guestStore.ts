import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface GuestState {
  guestSessionId: string | null;
  quizSessions: string[];
  getOrCreateSessionId: () => string;
  addQuizSession: (sessionId: string) => void;
  clearGuestData: () => void;
}

export const useGuestStore = create<GuestState>()(
  persist(
    (set, get) => ({
      guestSessionId: null,
      quizSessions: [],

      getOrCreateSessionId: () => {
        const existing = get().guestSessionId;
        if (existing) return existing;
        const newId = crypto.randomUUID();
        set({ guestSessionId: newId });
        return newId;
      },

      addQuizSession: (sessionId: string) => {
        set((state) => ({
          quizSessions: [...state.quizSessions, sessionId],
        }));
      },

      clearGuestData: () => {
        set({ guestSessionId: null, quizSessions: [] });
      },
    }),
    {
      name: 'guest-session',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
