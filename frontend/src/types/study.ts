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

export type StudyContentType = 'summary' | 'flashcards' | 'mindmap';
