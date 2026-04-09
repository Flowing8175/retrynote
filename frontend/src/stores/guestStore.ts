import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface GuestQuestion {
  question_type: string;
  question_text: string;
  options: Record<string, string> | null;
  correct_answer: Record<string, string>;
  explanation: string;
  concept_label: string;
  difficulty: string;
}

interface GuestState {
  // Quiz data
  topic: string | null;
  questions: GuestQuestion[];
  setGuestQuiz: (topic: string, questions: GuestQuestion[]) => void;
  clearGuestQuiz: () => void;

  // Session data
  guestSessionId: string | null;
  quizSessions: string[];
  getOrCreateSessionId: () => string;
  addQuizSession: (sessionId: string) => void;
  clearGuestData: () => void;
}

export const useGuestStore = create<GuestState>()(
  persist(
    (set, get) => ({
      topic: null,
      questions: [],
      guestSessionId: null,
      quizSessions: [],

      setGuestQuiz: (topic, questions) => set({ topic, questions }),
      clearGuestQuiz: () => set({ topic: null, questions: [] }),

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
        set({ guestSessionId: null, quizSessions: [], topic: null, questions: [] });
      },
    }),
    {
      name: 'guest-session',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
