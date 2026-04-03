export interface QuizSessionCreate {
  mode: 'normal' | 'exam';
  selected_file_ids: string[];
  manual_text: string | null;
  question_count: number | null;
  difficulty: string | null;
  question_types: string[];
  generation_priority: string | null;
  source_mode: 'document_based' | 'no_source';
  idempotency_key: string | null;
}

export interface QuizSessionResponse {
  quiz_session_id: string;
  status: string;
  job_id: string | null;
}

export interface QuizSessionDetail {
  id: string;
  mode: string;
  source_mode: string;
  status: string;
  difficulty: string | null;
  question_count: number | null;
  generation_model_name: string | null;
  grading_model_name: string | null;
  started_at: string | null;
  submitted_at: string | null;
  graded_at: string | null;
  total_score: number | null;
  max_score: number | null;
  items_count: number;
  created_at: string;
}

export interface QuizSessionHistoryItem {
  id: string;
  mode: string;
  source_mode: string;
  status: string;
  question_count: number | null;
  difficulty: string | null;
  total_score: number | null;
  max_score: number | null;
  created_at: string;
}

export interface QuizItemResponse {
  id: string;
  item_order: number;
  question_type: string;
  question_text: string;
  options: Record<string, unknown> | null;
  difficulty: string | null;
  concept_label: string | null;
  category_tag: string | null;
}

export interface QuizItemDetail extends QuizItemResponse {
  correct_answer: Record<string, unknown> | null;
  explanation: string | null;
  tips: string | null;
  source_refs: Record<string, unknown> | null;
}

export interface AnswerSubmit {
  user_answer: string;
}

export interface AnswerResponse {
  answer_log_id: string;
  judgement: string;
  score_awarded: number;
  max_score: number;
  grading_confidence: number | null;
  grading_rationale: string | null;
  explanation: string | null;
  tips: string | null;
  missing_points: Record<string, unknown> | null;
  error_type: string | null;
  normalized_user_answer: string | null;
  suggested_feedback: string | null;
  next_item_id: string | null;
}

export interface DraftAnswerSubmit {
  item_id: string;
  user_answer: string;
}

export interface DraftAnswerResponse {
  saved_at: string;
}

export interface ExamSubmit {
  idempotency_key: string;
}

export interface ExamSubmitResponse {
  status: string;
  job_id: string | null;
}
