export interface SearchQuery {
  q: string;
  scope: 'all' | 'files' | 'wrong_notes' | 'quiz_history';
  file_id: string | null;
  folder_id: string | null;
  page: number;
  size: number;
}

export interface SearchResultItem {
  result_type: 'file' | 'wrong_note' | 'quiz_session' | 'quiz_item';
  title: string;
  snippet: string | null;
  highlight: string | null;
  source_id: string;
  source_metadata: Record<string, unknown> | null;
  relevance_score: number | null;
}

export interface SearchResponse {
  results: SearchResultItem[];
  total: number;
  page: number;
  size: number;
}
