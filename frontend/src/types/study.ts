export type ContentStatus = 'not_generated' | 'generating' | 'completed' | 'failed';

export interface StudyStatus {
  file_id: string;
  filename: string | null;
  file_type: string | null;
  file_status: string;
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
  label: string;
  children?: StudyMindmapNode[];
}

export interface StudyMindmap {
  file_id: string;
  root: StudyMindmapNode | null;
  generated_at: string | null;
  status: ContentStatus;
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
