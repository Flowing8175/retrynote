import type { QuizItemResponse } from '@/types';

export type LocalJudgement = 'correct' | 'incorrect' | 'pending_ai';

export interface LocalGradeResult {
  judgement: LocalJudgement;
  score_awarded: number;
  max_score: number;
  correct_answer: Record<string, unknown> | null;
  explanation: string | null;
  error_type: string | null;
}

function normalizeAnswer(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Grade a quiz item answer entirely in the browser.
 *
 * - multiple_choice / ox  → exact string match against correct_answer.answer
 * - short_answer / fill_blank → exact match against accepted_answers (or answer),
 *                               falls back to 'pending_ai' when no exact match found
 * - essay → always 'pending_ai' (requires server-side AI grading)
 */
export function gradeLocally(
  item: QuizItemResponse,
  userAnswer: string,
): LocalGradeResult {
  const qType = item.question_type;
  const correctAnswer = item.correct_answer;
  const explanation = item.explanation ?? null;

  if (qType === 'multiple_choice' || qType === 'ox') {
    const correct = normalizeAnswer(String(correctAnswer?.answer ?? ''));
    const given = normalizeAnswer(userAnswer);
    const isCorrect = correct !== '' && correct === given;
    return {
      judgement: isCorrect ? 'correct' : 'incorrect',
      score_awarded: isCorrect ? 1 : 0,
      max_score: 1,
      correct_answer: correctAnswer,
      explanation,
      error_type: isCorrect ? null : 'careless_mistake',
    };
  }

  if (qType === 'short_answer' || qType === 'fill_blank') {
    const accepted = (correctAnswer?.accepted_answers as string[] | undefined) ??
      [String(correctAnswer?.answer ?? '')];
    const given = normalizeAnswer(userAnswer);
    const isExactMatch = accepted.some((a) => normalizeAnswer(String(a)) === given);
    if (isExactMatch) {
      return {
        judgement: 'correct',
        score_awarded: 1,
        max_score: 1,
        correct_answer: correctAnswer,
        explanation,
        error_type: null,
      };
    }
    // Needs AI grading to confirm
    return {
      judgement: 'pending_ai',
      score_awarded: 0,
      max_score: 1,
      correct_answer: correctAnswer,
      explanation,
      error_type: null,
    };
  }

  // essay — always needs server-side AI grading
  return {
    judgement: 'pending_ai',
    score_awarded: 0,
    max_score: 1,
    correct_answer: correctAnswer,
    explanation,
    error_type: null,
  };
}
