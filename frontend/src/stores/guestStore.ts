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
  topic: string | null;
  questions: GuestQuestion[];
  setGuestQuiz: (topic: string, questions: GuestQuestion[]) => void;
  clearGuestQuiz: () => void;
}

export const useGuestStore = create<GuestState>()(
  persist(
    (set) => ({
      topic: null,
      questions: [],
      setGuestQuiz: (topic, questions) => set({ topic, questions }),
      clearGuestQuiz: () => set({ topic: null, questions: [] }),
    }),
    {
      name: 'guest-quiz',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
