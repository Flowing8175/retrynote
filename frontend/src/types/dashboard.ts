export interface DashboardResponse {
  overall_accuracy: number;
  score_rate: number;
  learning_volume: number;
  weak_concepts: Array<{
    concept_key: string;
    concept_label: string;
    category_tag: string;
    wrong_count: number;
    partial_count: number;
    skip_count: number;
    streak_wrong_count: number;
    recommended_action: string;
  }>;
  accuracy_by_type: Array<{
    question_type: string;
    accuracy: number;
    count: number;
  }>;
  accuracy_by_subject: Array<{
    category_tag: string;
    accuracy: number;
    count: number;
  }>;
  accuracy_by_file: Array<{
    file_id: string;
    filename: string;
    accuracy: number;
    count: number;
  }>;
  retry_recommendations: Array<{
    concept_key: string;
    concept_label: string;
    category_tag: string;
    wrong_count: number;
    partial_count: number;
    skip_count: number;
    streak_wrong_count: number;
    recommended_action: string;
  }>;
  recent_wrong_notes: Array<{
    question_text: string;
    concept_key: string;
    concept_label: string;
    judgement: string;
    graded_at: string | null;
  }>;
  coaching_summary: string | null;
}

export interface DashboardQuery {
  range: '7d' | '30d' | 'all';
  file_id: string | null;
  category_tag: string | null;
}
