export interface SavedPrompt {
  id: string;
  slot: number;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface SavedPromptCreate {
  content: string;
}

export interface SavedPromptUpsert {
  content: string;
}
