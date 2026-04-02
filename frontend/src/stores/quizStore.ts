import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { QuizSessionDetail, QuizItemResponse } from '@/types';

interface QuizState {
  currentSession: QuizSessionDetail | null;
  currentItems: QuizItemResponse[];
  currentAnswerMap: Record<string, string>;
  currentIndex: number;
  isExamMode: boolean;
  setCurrentSession: (session: QuizSessionDetail | null) => void;
  setCurrentItems: (items: QuizItemResponse[]) => void;
  setCurrentAnswer: (itemId: string, answer: string) => void;
  clearCurrentAnswer: (itemId: string) => void;
  setCurrentIndex: (index: number) => void;
  setExamMode: (isExam: boolean) => void;
  resetQuiz: () => void;
}

export const useQuizStore = create<QuizState>()(
  persist(
    (set) => ({
      currentSession: null,
      currentItems: [],
      currentAnswerMap: {},
      currentIndex: 0,
      isExamMode: false,

      setCurrentSession: (session) => set({ currentSession: session }),

      setCurrentItems: (items) => set({ currentItems: items }),

      setCurrentAnswer: (itemId, answer) => set((state) => ({
        currentAnswerMap: { ...state.currentAnswerMap, [itemId]: answer },
      })),

      clearCurrentAnswer: (itemId) => set((state) => {
        const newMap = { ...state.currentAnswerMap };
        delete newMap[itemId];
        return { currentAnswerMap: newMap };
      }),

      setCurrentIndex: (index) => set({ currentIndex: index }),

      setExamMode: (isExam) => set({ isExamMode: isExam }),

      resetQuiz: () => set({
        currentSession: null,
        currentItems: [],
        currentAnswerMap: {},
        currentIndex: 0,
        isExamMode: false,
      }),
    }),
    {
      name: 'quiz-storage',
    }
  )
);
