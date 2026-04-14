import { create } from 'zustand';
import { studyApi } from '@/api/study';
import type { ContentStatus, StudyContentType, StudyChatMessage } from '@/types/study';

export interface ChatEntry {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  pageContext?: number | null;
}

interface ChatState {
  chatMessages: ChatEntry[];
  isStreaming: boolean;
  streamingContent: string;
  selectedPageForCapture: number | null;
  setChatMessages: (messages: StudyChatMessage[]) => void;
  addUserMessage: (content: string, pageContext?: number | null) => void;
  appendStreamingContent: (token: string) => void;
  finalizeStreamingMessage: () => void;
  clearMessages: () => void;
  setIsStreaming: (v: boolean) => void;
  setSelectedPage: (page: number | null) => void;
}

interface GenerationStatusState {
  summary: ContentStatus;
  flashcards: ContentStatus;
  mindmap: ContentStatus;
}

const defaultStatus: GenerationStatusState = {
  summary: 'not_generated',
  flashcards: 'not_generated',
  mindmap: 'not_generated',
};

interface StudyStoreState extends ChatState {
  generationStatus: GenerationStatusState;
  _timerId: ReturnType<typeof setInterval> | null;
  _currentFileId: string | null;

  initStatus: (status: {
    summary_status: ContentStatus;
    flashcards_status: ContentStatus;
    mindmap_status: ContentStatus;
  }) => void;

  triggerGenerate: (fileId: string, type: StudyContentType) => Promise<void>;
  startPolling: (fileId: string) => void;
  stopPolling: () => void;
  resetStatus: () => void;
}

export const useStudyStore = create<StudyStoreState>((set, get) => ({
  chatMessages: [],
  isStreaming: false,
  streamingContent: '',
  selectedPageForCapture: null,

  setChatMessages: (messages) =>
    set({
      chatMessages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        pageContext: null,
      })),
    }),

  addUserMessage: (content, pageContext) =>
    set((state) => ({
      chatMessages: [
        ...state.chatMessages,
        { id: `user-${Date.now()}`, role: 'user' as const, content, pageContext: pageContext ?? null },
      ],
      isStreaming: true,
      streamingContent: '',
    })),

  appendStreamingContent: (token) =>
    set((state) => ({ streamingContent: state.streamingContent + token })),

  finalizeStreamingMessage: () =>
    set((state) => ({
      chatMessages: [
        ...state.chatMessages,
        { id: `ai-${Date.now()}`, role: 'assistant' as const, content: state.streamingContent, pageContext: null },
      ],
      isStreaming: false,
      streamingContent: '',
    })),

  clearMessages: () =>
    set({ chatMessages: [], isStreaming: false, streamingContent: '', selectedPageForCapture: null }),

  setIsStreaming: (v) => set({ isStreaming: v }),

  setSelectedPage: (page) => set({ selectedPageForCapture: page }),

  generationStatus: { ...defaultStatus },
  _timerId: null,
  _currentFileId: null,

  initStatus: ({ summary_status, flashcards_status, mindmap_status }) => {
    set({
      generationStatus: {
        summary: summary_status,
        flashcards: flashcards_status,
        mindmap: mindmap_status,
      },
    });

    const anyGenerating =
      summary_status === 'generating' ||
      flashcards_status === 'generating' ||
      mindmap_status === 'generating';

    if (anyGenerating && get()._currentFileId) {
      get().startPolling(get()._currentFileId!);
    }
  },

  triggerGenerate: async (fileId, type) => {
    set((state) => ({
      generationStatus: {
        ...state.generationStatus,
        [type]: 'generating' as ContentStatus,
      },
      _currentFileId: fileId,
    }));

    try {
      await studyApi.generateContent(fileId, type);
    } catch {
      set((state) => ({
        generationStatus: {
          ...state.generationStatus,
          [type]: 'failed' as ContentStatus,
        },
      }));
      return;
    }

    get().startPolling(fileId);
  },

  startPolling: (fileId) => {
    const existing = get()._timerId;
    if (existing !== null) {
      clearInterval(existing);
    }

    const timerId = setInterval(async () => {
      try {
        const status = await studyApi.getStatus(fileId);
        const { summary_status, flashcards_status, mindmap_status } = status;

        set({
          generationStatus: {
            summary: summary_status,
            flashcards: flashcards_status,
            mindmap: mindmap_status,
          },
        });

        const anyGenerating =
          summary_status === 'generating' ||
          flashcards_status === 'generating' ||
          mindmap_status === 'generating';

        if (!anyGenerating) {
          get().stopPolling();
        }
      } catch {
        get().stopPolling();
      }
    }, 3000);

    set({ _timerId: timerId, _currentFileId: fileId });
  },

  stopPolling: () => {
    const timerId = get()._timerId;
    if (timerId !== null) {
      clearInterval(timerId);
    }
    set({ _timerId: null });
  },

  resetStatus: () => {
    get().stopPolling();
    set({
      generationStatus: { ...defaultStatus },
      _currentFileId: null,
    });
  },
}));
