export type ContentStatus = 'not_generated' | 'generating' | 'completed' | 'failed';

export interface StudyStatus {
  file_id: string;
  filename: string | null;
  file_type: string | null;
  file_status: string | null;
  is_short_document: boolean;
  summary_status: ContentStatus;
  flashcards_status: ContentStatus;
  mindmap_status: ContentStatus;
  concept_notes_status: ContentStatus;
}

export interface StudySummary {
  file_id: string;
  content: string;
  generated_at: string | null;
  status: ContentStatus;
}

export interface StudyFlashcard {
  id: string;
  front: string;
  back: string;
  hint: string | null;
  difficulty: number | null;
}

export interface StudyFlashcardSet {
  file_id: string;
  cards: StudyFlashcard[];
  generated_at: string | null;
  status: ContentStatus;
}

export interface StudyMindmapNode {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data: { label: string; [key: string]: unknown };
}

export interface StudyMindmapEdge {
  id: string;
  source: string;
  target: string;
  type?: string;
  style?: Record<string, unknown>;
}

export interface StudyMindmap {
  file_id: string;
  data: { nodes: StudyMindmapNode[]; edges: StudyMindmapEdge[] } | null;
  generated_at: string | null;
  status: ContentStatus;
}

export interface ConceptNoteItem {
  id: string;
  name: string;
  explanation: string;
  key_points: string[];
  keywords: string[];
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface StudyConceptNote {
  file_id: string;
  concepts: ConceptNoteItem[];
  generated_at: string | null;
  status: ContentStatus;
}

export interface MindmapNodeExplanation {
  node_id: string;
  node_label: string;
  explanation: string;
  cached: boolean;
}

export interface StudyChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface StudyChatHistory {
  file_id: string;
  messages: StudyChatMessage[];
}

export type StudyContentType = 'summary' | 'flashcards' | 'mindmap' | 'concept-notes';

export interface StudyHistoryItem {
  file_id: string;
  original_filename: string | null;
  file_type: string | null;
  file_size_bytes: number;
  source_type: string;
  status: string;
  folder_id: string | null;
  last_visited_at: string;
  visit_count: number;
}

export interface StudyHistoryResponse {
  items: StudyHistoryItem[];
  total: number;
}

export interface StudyVisitResponse {
  status: string;
  last_visited_at: string;
  visit_count: number;
}

export interface ContentVersion {
  id: string;
  generated_at: string | null;
  model_used: string | null;
  is_current: boolean;
}

export interface ContentVersionsResponse {
  versions: ContentVersion[];
  total: number;
}

// --- SSE Streaming Types ---

export type StudyStreamStage = 'analyzing' | 'generating';

export interface StudyStreamEventStage {
  type: 'stage';
  stage: StudyStreamStage;
}
export interface StudyStreamEventThinkingStart {
  type: 'thinking_start';
}
export interface StudyStreamEventThinkingChunk {
  type: 'thinking_chunk';
  text: string;
}
export interface StudyStreamEventThinkingEnd {
  type: 'thinking_end';
}
export interface StudyStreamEventResult {
  type: 'result';
  data: Record<string, unknown>;
}

export type StudyStreamEvent =
  | StudyStreamEventStage
  | StudyStreamEventThinkingStart
  | StudyStreamEventThinkingChunk
  | StudyStreamEventThinkingEnd
  | StudyStreamEventResult;

export interface StudyStreamingState {
  isStreaming: boolean;
  stage: StudyStreamStage | null;
  thinkingText: string;
  thinkingActive: boolean;
  result: Record<string, unknown> | null;
  error: string | null;
}
