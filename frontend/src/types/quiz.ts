export interface QuizSessionCreate {
  mode: 'normal' | 'exam';
  selected_file_ids: string[];
  manual_text: string | null;
  question_count: number | null;
  difficulty: string | null;
  question_types: string[];
  generation_priority: string | null;
  preferred_model: string | null;
  source_mode: 'document_based' | 'no_source';
  topic: string | null;
  idempotency_key: string | null;
}

export interface QuizSessionResponse {
  quiz_session_id: string;
  status: string;
  job_id: string | null;
}

export interface QuizConfig {
  default_generation_model: string;
  available_generation_models: string[];
  generation_model_options: Array<{
    tier: string;
    value: string;
    label: string;
    is_default: boolean;
    is_trial?: boolean;
  }>;
}

export interface QuizSessionDetail {
  id: string;
  mode: string;
  source_mode: string;
  status: string;
  difficulty: string | null;
  question_count: number | null;
  generation_model_name: string | null;
  started_at: string | null;
  submitted_at: string | null;
  graded_at: string | null;
  total_score: number | null;
  max_score: number | null;
  items_count: number;
  created_at: string;
  error_message?: string | null;
}

export interface QuizSessionHistoryItem {
  id: string;
  title: string | null;
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
  options: Record<string, unknown> | unknown[] | null;
  option_descriptions: Record<string, string> | null;
  difficulty: string | null;
  concept_key: string | null;
  concept_label: string | null;
  category_tag: string | null;
  correct_answer: Record<string, unknown> | null;
  explanation: string | null;
  tips: string | null;
}

export interface QuizItemDetail extends QuizItemResponse {
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
  missing_points: string[] | null;
  error_type: string | null;
  normalized_user_answer: string | null;
  suggested_feedback: string | null;
  next_item_id: string | null;
  correct_answer: Record<string, unknown> | null;
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

export interface SessionCompleteResponse {
  status: string;
  total_score: number;
  max_score: number;
}

export interface DraftAnswerEntry {
  item_id: string;
  user_answer: string;
  saved_at: string;
}

export interface AnswerLogEntry {
  item_id: string;
  answer_log_id: string;
  user_answer: string;
  judgement: string;
  score_awarded: number;
  max_score: number;
  grading_confidence: number | null;
  grading_rationale: string | null;
  explanation: string | null;
  tips: string | null;
  missing_points: string[] | null;
  error_type: string | null;
  normalized_user_answer: string | null;
  suggested_feedback: string | null;
  correct_answer: Record<string, unknown> | null;
}

export interface BatchAnswerItem {
  item_id: string;
  user_answer: string;
}

export interface BatchAnswerSubmit {
  answers: BatchAnswerItem[];
}

export interface BatchItemResult {
  item_id: string;
  answer_log_id: string;
  judgement: string;
  score_awarded: number;
  max_score: number;
  grading_confidence: number | null;
  grading_rationale: string | null;
  missing_points: string[] | null;
  error_type: string | null;
  suggested_feedback: string | null;
  correct_answer: Record<string, unknown> | null;
  explanation: string | null;
}

export interface BatchAnswerResponse {
  results: BatchItemResult[];
  total_score: number;
  max_score: number;
}
