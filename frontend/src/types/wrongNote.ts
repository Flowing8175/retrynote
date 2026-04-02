export interface WrongNoteItem {
  id: string;
  question_text: string;
  question_type: string;
  options: Record<string, unknown> | null;
  correct_answer: Record<string, unknown> | null;
  user_answer_raw: string | null;
  user_answer_normalized: string | null;
  judgement: string;
  score_awarded: number;
  max_score: number;
  explanation: string | null;
  concept_key: string | null;
  concept_label: string | null;
  category_tag: string | null;
  error_type: string | null;
  missing_points: Record<string, unknown> | null;
  graded_at: string | null;
  file_id: string | null;
  original_filename: string | null;
  created_at: string;
}

export interface WrongNoteListResponse {
  items: WrongNoteItem[];
  total: number;
  page: number;
  size: number;
}

export interface WrongNoteErrorTypeUpdate {
  error_type: string;
}
