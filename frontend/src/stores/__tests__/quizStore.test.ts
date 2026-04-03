import { useQuizStore } from '@/stores/quizStore';
import type { QuizSessionDetail, QuizItemResponse } from '@/types';

const mockSession: QuizSessionDetail = {
  id: 's1',
  status: 'in_progress',
  quiz_type: 'mixed',
  difficulty: 'medium',
  item_count: 5,
  score: null,
  score_rate: null,
  is_retry: false,
  source_file_id: null,
  source_file_name: null,
  created_at: '2024-01-01T00:00:00Z',
  submitted_at: null,
  graded_at: null,
} as QuizSessionDetail;

const mockItem: QuizItemResponse = {
  id: 'i1',
  question_text: 'What is 1+1?',
  quiz_type: 'short_answer',
  options: null,
  order_num: 1,
} as QuizItemResponse;

describe('quizStore', () => {
  beforeEach(() => {
    useQuizStore.getState().resetQuiz();
  });

  describe('initial state', () => {
    it('has null session, empty items, empty answers, index 0, not exam mode', () => {
      const s = useQuizStore.getState();
      expect(s.currentSession).toBeNull();
      expect(s.currentItems).toEqual([]);
      expect(s.currentAnswerMap).toEqual({});
      expect(s.currentIndex).toBe(0);
      expect(s.isExamMode).toBe(false);
    });
  });

  describe('setCurrentSession', () => {
    it('sets session', () => {
      useQuizStore.getState().setCurrentSession(mockSession);
      expect(useQuizStore.getState().currentSession).toEqual(mockSession);
    });

    it('clears session with null', () => {
      useQuizStore.getState().setCurrentSession(mockSession);
      useQuizStore.getState().setCurrentSession(null);
      expect(useQuizStore.getState().currentSession).toBeNull();
    });
  });

  describe('setCurrentItems', () => {
    it('sets items array', () => {
      useQuizStore.getState().setCurrentItems([mockItem]);
      expect(useQuizStore.getState().currentItems).toEqual([mockItem]);
    });
  });

  describe('setCurrentAnswer', () => {
    it('adds answer to map', () => {
      useQuizStore.getState().setCurrentAnswer('i1', 'two');
      expect(useQuizStore.getState().currentAnswerMap).toEqual({ i1: 'two' });
    });

    it('accumulates multiple answers', () => {
      const store = useQuizStore.getState();
      store.setCurrentAnswer('i1', 'two');
      useQuizStore.getState().setCurrentAnswer('i2', 'three');
      expect(useQuizStore.getState().currentAnswerMap).toEqual({ i1: 'two', i2: 'three' });
    });
  });

  describe('clearCurrentAnswer', () => {
    it('removes specific answer and keeps others', () => {
      const store = useQuizStore.getState();
      store.setCurrentAnswer('i1', 'a');
      useQuizStore.getState().setCurrentAnswer('i2', 'b');
      useQuizStore.getState().clearCurrentAnswer('i1');
      const map = useQuizStore.getState().currentAnswerMap;
      expect(map).not.toHaveProperty('i1');
      expect(map.i2).toBe('b');
    });
  });

  describe('setCurrentIndex', () => {
    it('updates index', () => {
      useQuizStore.getState().setCurrentIndex(3);
      expect(useQuizStore.getState().currentIndex).toBe(3);
    });
  });

  describe('setExamMode', () => {
    it('toggles exam mode', () => {
      useQuizStore.getState().setExamMode(true);
      expect(useQuizStore.getState().isExamMode).toBe(true);
      useQuizStore.getState().setExamMode(false);
      expect(useQuizStore.getState().isExamMode).toBe(false);
    });
  });

  describe('resetQuiz', () => {
    it('clears all state back to defaults', () => {
      const store = useQuizStore.getState();
      store.setCurrentSession(mockSession);
      store.setCurrentItems([mockItem]);
      useQuizStore.getState().setCurrentAnswer('i1', 'a');
      useQuizStore.getState().setCurrentIndex(5);
      useQuizStore.getState().setExamMode(true);

      useQuizStore.getState().resetQuiz();
      const s = useQuizStore.getState();
      expect(s.currentSession).toBeNull();
      expect(s.currentItems).toEqual([]);
      expect(s.currentAnswerMap).toEqual({});
      expect(s.currentIndex).toBe(0);
      expect(s.isExamMode).toBe(false);
    });
  });
});
