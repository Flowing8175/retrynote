export interface GuestQuizSession {
  session_id: string;
  status: 'draft' | 'generating' | 'ready' | 'in_progress' | 'graded' | 'generation_failed';
  question_count: number | null;
  difficulty: string | null;
  created_at: string;
  total_score: number | null;
  max_score: number | null;
}

export interface GuestQuizItem {
  id: string;
  item_order: number;
  question_type: 'multiple_choice' | 'ox' | 'short_answer' | 'fill_blank' | 'essay';
  question_text: string;
  options_json: Record<string, string> | null;
  option_descriptions_json: Record<string, string | null> | null;
  difficulty: string | null;
}

export interface GuestAnswerResult {
  is_correct: boolean;
  score: number;
  max_score: number;
  rationale: string | null;
  correct_answer: string;
  explanation: string | null;
  judgement: 'correct' | 'partial' | 'incorrect';
  error_type: string | null;
}

export interface GuestQuizResultItem {
  id: string;
  item_order: number;
  question_type: string;
  question_text: string;
  options_json: Record<string, string> | null;
  correct_answer_json: Record<string, unknown> | null;
  explanation_text: string | null;
  user_answer: string | null;
  judgement: string;
  score_awarded: number;
  max_score: number;
  grading_rationale: string | null;
}

export interface GuestQuizResults {
  session_id: string;
  total_score: number;
  max_score: number;
  items: GuestQuizResultItem[];
}

export interface GuestFileUpload {
  file_id: string;
  filename: string;
  status: string;
}
