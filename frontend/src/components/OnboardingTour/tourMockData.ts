import type { QueryClient } from '@tanstack/react-query';
import type {
  DashboardResponse,
  FileListResponse,
  QuizConfig,
  WrongNoteListResponse,
} from '@/types';

/**
 * Seeds React Query cache with mock data for all 5 tour pages.
 * This allows pages to render populated content during the tour without real API calls.
 */
export function seedTourMockData(queryClient: QueryClient): void {
  const dashboardMockData: DashboardResponse = {
    overall_accuracy: 0.78,
    score_rate: 0.82,
    learning_volume: 12,
    weak_concepts: [
      {
        concept_key: 'concept_1',
        concept_label: '미분 기초',
        category_tag: '수학',
        wrong_count: 3,
        partial_count: 1,
        skip_count: 0,
        streak_wrong_count: 2,
        recommended_action: '복습 필요',
      },
      {
        concept_key: 'concept_2',
        concept_label: '적분 응용',
        category_tag: '수학',
        wrong_count: 2,
        partial_count: 2,
        skip_count: 0,
        streak_wrong_count: 1,
        recommended_action: '복습 필요',
      },
      {
        concept_key: 'concept_3',
        concept_label: '벡터 연산',
        category_tag: '수학',
        wrong_count: 1,
        partial_count: 1,
        skip_count: 0,
        streak_wrong_count: 0,
        recommended_action: '복습 권장',
      },
    ],
    accuracy_by_type: [
      { question_type: 'multiple_choice', accuracy: 0.85, count: 7 },
      { question_type: 'ox', accuracy: 0.75, count: 4 },
      { question_type: 'short_answer', accuracy: 0.67, count: 3 },
    ],
    accuracy_by_subject: [
      { category_tag: '수학', accuracy: 0.78, count: 12 },
    ],
    accuracy_by_file: [
      { file_id: 'file_1', filename: '미적분학 기초.pdf', accuracy: 0.78, count: 12 },
    ],
    retry_recommendations: [
      {
        concept_key: 'concept_1',
        concept_label: '미분 기초',
        category_tag: '수학',
        wrong_count: 3,
        partial_count: 1,
        skip_count: 0,
        streak_wrong_count: 2,
        recommended_action: '복습 필요',
      },
      {
        concept_key: 'concept_2',
        concept_label: '적분 응용',
        category_tag: '수학',
        wrong_count: 2,
        partial_count: 2,
        skip_count: 0,
        streak_wrong_count: 1,
        recommended_action: '복습 필요',
      },
    ],
    recent_wrong_notes: [
      {
        question_text: '다음 함수의 도함수를 구하시오: f(x) = x³ + 2x',
        concept_key: 'concept_1',
        concept_label: '미분 기초',
        judgement: 'incorrect',
        graded_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        question_text: '정적분 ∫₀¹ x² dx의 값을 구하시오.',
        concept_key: 'concept_2',
        concept_label: '적분 응용',
        judgement: 'incorrect',
        graded_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        question_text: '벡터 (1, 2, 3)과 (4, 5, 6)의 내적을 구하시오.',
        concept_key: 'concept_3',
        concept_label: '벡터 연산',
        judgement: 'incorrect',
        graded_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      },
    ],
    coaching_summary: '최근 미분 개념에서 실수가 많습니다. 기초부터 다시 복습해보세요.',
  };

  queryClient.setQueryData(['dashboard', '7d', null, null], dashboardMockData);

  const filesMockData: FileListResponse = {
    files: [
      {
        id: 'file_1',
        original_filename: '미적분학 기초.pdf',
        file_type: 'PDF',
        file_size_bytes: 2048000,
        source_type: 'upload',
        source_url: null,
        stored_path: '/storage/file_1.pdf',
        status: 'ready',
        parse_error_code: null,
        ocr_required: false,
        retry_count: 0,
        is_searchable: true,
        is_quiz_eligible: true,
        processing_started_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        processing_finished_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
        folder_id: null,
        created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'file_2',
        original_filename: '선형대수 강의노트.docx',
        file_type: 'DOCX',
        file_size_bytes: 1024000,
        source_type: 'upload',
        source_url: null,
        stored_path: '/storage/file_2.docx',
        status: 'ready',
        parse_error_code: null,
        ocr_required: false,
        retry_count: 0,
        is_searchable: true,
        is_quiz_eligible: true,
        processing_started_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        processing_finished_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        folder_id: null,
        created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ],
    total: 2,
    page: 1,
    size: 20,
  };

  queryClient.setQueryData(['files', 1, '', null], filesMockData);
  queryClient.setQueryData(['files', 'ready'], filesMockData);

  const quizConfigMockData: QuizConfig = {
    default_generation_model: 'gpt-4o-mini',
    available_generation_models: ['gpt-4o', 'gpt-4o-mini', 'gemini-2.0-flash'],
    generation_model_options: [
      {
        tier: 'ECO',
        value: 'gpt-4o-mini',
        label: 'GPT-4o Mini',
        is_default: true,
        is_trial: false,
      },
      {
        tier: 'BALANCED',
        value: 'gpt-4o',
        label: 'GPT-4o',
        is_default: false,
        is_trial: false,
      },
      {
        tier: 'PERFORMANCE',
        value: 'gemini-2.0-flash',
        label: 'Gemini 2.0 Flash',
        is_default: false,
        is_trial: false,
      },
    ],
  };

  queryClient.setQueryData(['quiz-config'], quizConfigMockData);

  const wrongNotesMockData: WrongNoteListResponse = {
    items: [
      {
        id: 'wrong_1',
        question_text: '다음 함수의 도함수를 구하시오: f(x) = x³ + 2x',
        question_type: 'short_answer',
        options: null,
        correct_answer: { answer: '3x² + 2' },
        user_answer_raw: '3x² + 1',
        user_answer_normalized: '3x² + 1',
        judgement: 'incorrect',
        score_awarded: 0,
        max_score: 10,
        explanation: '상수항의 미분을 다시 확인해보세요. 2의 미분은 0입니다.',
        concept_key: 'concept_1',
        concept_label: '미분 기초',
        category_tag: '수학',
        error_type: 'careless_mistake',
        missing_points: { point: '상수항 미분' },
        graded_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        file_id: 'file_1',
        original_filename: '미적분학 기초.pdf',
        created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'wrong_2',
        question_text: '정적분 ∫₀¹ x² dx의 값을 구하시오.',
        question_type: 'short_answer',
        options: null,
        correct_answer: { answer: '1/3' },
        user_answer_raw: '1/2',
        user_answer_normalized: '1/2',
        judgement: 'incorrect',
        score_awarded: 0,
        max_score: 10,
        explanation: 'x²의 부정적분은 x³/3입니다. 정적분 계산을 다시 확인해보세요.',
        concept_key: 'concept_2',
        concept_label: '적분 응용',
        category_tag: '수학',
        error_type: 'concept_confusion',
        missing_points: { point: '부정적분 공식' },
        graded_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        file_id: 'file_1',
        original_filename: '미적분학 기초.pdf',
        created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'wrong_3',
        question_text: '벡터 (1, 2, 3)과 (4, 5, 6)의 내적을 구하시오.',
        question_type: 'short_answer',
        options: null,
        correct_answer: { answer: '32' },
        user_answer_raw: '30',
        user_answer_normalized: '30',
        judgement: 'incorrect',
        score_awarded: 0,
        max_score: 10,
        explanation: '내적 계산: 1×4 + 2×5 + 3×6 = 4 + 10 + 18 = 32입니다.',
        concept_key: 'concept_3',
        concept_label: '벡터 연산',
        category_tag: '수학',
        error_type: 'careless_mistake',
        missing_points: { point: '계산 실수' },
        graded_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
        file_id: 'file_2',
        original_filename: '선형대수 강의노트.docx',
        created_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      },
    ],
    total: 3,
    page: 1,
    size: 20,
  };

  queryClient.setQueryData(['wrongNotes', 1, 'concept', []], wrongNotesMockData);
  queryClient.setQueryData(['wrongNotes-manual-options'], wrongNotesMockData);
}

/**
 * Cleans up mock data from React Query cache.
 * Removes all seeded queries and invalidates to trigger fresh fetches.
 */
export function cleanupTourMockData(queryClient: QueryClient): void {
  queryClient.removeQueries({ queryKey: ['dashboard'] });
  queryClient.removeQueries({ queryKey: ['files', 'ready'] });
  queryClient.removeQueries({ queryKey: ['files'] });
  queryClient.removeQueries({ queryKey: ['quiz-config'] });
  queryClient.removeQueries({ queryKey: ['wrongNotes'] });
  queryClient.removeQueries({ queryKey: ['wrongNotes-manual-options'] });
  queryClient.invalidateQueries();
}
