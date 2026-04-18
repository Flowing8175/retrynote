export interface RetryLocationState {
  conceptKeys: string[];
  conceptLabels: Record<string, string>;
  selectedCount?: number;
}

export interface RetrySetCreate {
  source: 'wrong_notes' | 'dashboard_recommendation' | 'concept_manual' | 'quiz_session';
  concept_keys: string[] | null;
  size: number | null;
  quiz_session_id?: string | null;
  mode?: 'normal' | 'exam';
  difficulty?: string | null;
  question_types?: string[];
  preferred_model?: string | null;
  user_instruction?: string | null;
}

export interface RetrySetResponse {
  quiz_session_id: string;
  job_id: string;
}
