export const QUESTION_TYPE_LABELS: Record<string, string> = {
  multiple_choice: '객관식',
  fill_blank: '빈칸 채우기',
  short_answer: '단답형',
  essay: '서술형',
  ox: 'O/X',
};

export const DEFAULT_OX_OPTIONS: Record<string, string> = {
  O: 'O',
  X: 'X',
};

export const AUTO_SUBMIT_QUESTION_TYPES = new Set(['multiple_choice', 'ox']);

export const FREE_TEXT_QUESTION_TYPES = new Set(['short_answer', 'essay', 'fill_blank']);

export const generatingPhrases = [
  '학습 자료 분석 중...',
  '핵심 개념 추출 중...',
  '문항 설계 중...',
  '정답 및 해설 작성 중...',
  '마지막 검토 중...',
  '거의 완성됐어요!',
];

export function normalizeOxValue(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}
