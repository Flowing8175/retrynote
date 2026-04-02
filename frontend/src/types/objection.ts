export interface ObjectionCreate {
  answer_log_id: string;
  objection_reason: string;
}

export interface ObjectionResponse {
  objection_id: string;
  status: string;
}

export interface ObjectionDetail {
  id: string;
  quiz_session_id: string;
  quiz_item_id: string;
  answer_log_id: string;
  objection_reason: string;
  status: string;
  review_result: Record<string, unknown> | null;
  decided_at: string | null;
  decided_by: string | null;
  created_at: string;
}
