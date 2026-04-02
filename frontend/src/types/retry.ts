export interface RetrySetCreate {
  source: 'wrong_notes' | 'dashboard_recommendation' | 'concept_manual';
  concept_keys: string[] | null;
  size: number;
}

export interface RetrySetResponse {
  quiz_session_id: string;
  job_id: string;
}
