import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/api/study', () => ({
  useChatHistory: vi.fn(),
}));

vi.mock('@/hooks/useSSE', () => ({
  useSSE: vi.fn(),
}));

vi.mock('@/stores/studyStore', () => ({
  useStudyStore: vi.fn(),
}));

vi.mock('@/api/client', () => ({
  default: {
    post: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => <span>{children}</span>,
}));

import { useChatHistory } from '@/api/study';
import { useStudyStore } from '@/stores/studyStore';
import { TutorTab } from '../TutorTab';

window.HTMLElement.prototype.scrollIntoView = vi.fn();

function makeStoreState(overrides: Partial<ReturnType<typeof useStudyStore>> = {}) {
  return {
    chatMessages: [],
    isStreaming: false,
    streamingContent: '',
    selectedPageForCapture: null,
    setChatMessages: vi.fn(),
    addUserMessage: vi.fn(),
    appendStreamingContent: vi.fn(),
    finalizeStreamingMessage: vi.fn(),
    clearMessages: vi.fn(),
    setIsStreaming: vi.fn(),
    setSelectedPage: vi.fn(),
    generationStatus: {
      summary: 'not_generated' as const,
      flashcards: 'not_generated' as const,
      mindmap: 'not_generated' as const,
    },
    _timerId: null,
    _currentFileId: null,
    initStatus: vi.fn(),
    triggerGenerate: vi.fn(),
    startPolling: vi.fn(),
    stopPolling: vi.fn(),
    resetStatus: vi.fn(),
    ...overrides,
  };
}

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('TutorTab', () => {
  beforeEach(() => {
    vi.mocked(useChatHistory).mockReturnValue({
      data: { file_id: 'file-1', messages: [] },
      refetch: vi.fn(),
    } as ReturnType<typeof useChatHistory>);

    vi.mocked(useStudyStore).mockReturnValue(makeStoreState());
  });

  afterEach(() => vi.clearAllMocks());

  it('renders empty state with robot emoji when no messages', () => {
    render(<TutorTab fileId="file-1" />, { wrapper });

    expect(screen.getByText('AI 튜터에게 무엇이든 물어보세요!')).toBeInTheDocument();
  });

  it('shows suggestion buttons in empty state', () => {
    render(<TutorTab fileId="file-1" />, { wrapper });

    expect(screen.getByText('이 자료의 핵심 개념을 설명해 주세요')).toBeInTheDocument();
    expect(screen.getByText('어떤 부분을 더 공부해야 할까요?')).toBeInTheDocument();
    expect(screen.getByText('가장 중요한 내용 3가지를 알려주세요')).toBeInTheDocument();
  });

  it('clicking suggestion fills input textarea', async () => {
    const user = userEvent.setup();
    render(<TutorTab fileId="file-1" />, { wrapper });

    await user.click(screen.getByText('이 자료의 핵심 개념을 설명해 주세요'));

    expect(screen.getByPlaceholderText(/메시지 입력/i)).toHaveValue(
      '이 자료의 핵심 개념을 설명해 주세요',
    );
  });

  it('typing in textarea updates the input value', async () => {
    const user = userEvent.setup();
    render(<TutorTab fileId="file-1" />, { wrapper });

    const textarea = screen.getByPlaceholderText(/메시지 입력/i);
    await user.type(textarea, '안녕하세요');

    expect(textarea).toHaveValue('안녕하세요');
  });

  it('send button is disabled when input is empty', () => {
    render(<TutorTab fileId="file-1" />, { wrapper });

    expect(screen.getByRole('button', { name: '전송' })).toBeDisabled();
  });

  it('send button is enabled when input has text', async () => {
    const user = userEvent.setup();
    render(<TutorTab fileId="file-1" />, { wrapper });

    await user.type(screen.getByPlaceholderText(/메시지 입력/i), '질문입니다');

    expect(screen.getByRole('button', { name: '전송' })).not.toBeDisabled();
  });

  it('clicking send calls addUserMessage with typed content', async () => {
    const addUserMessage = vi.fn();
    vi.mocked(useStudyStore).mockReturnValue(makeStoreState({ addUserMessage }));

    const user = userEvent.setup();
    render(<TutorTab fileId="file-1" />, { wrapper });

    await user.type(screen.getByPlaceholderText(/메시지 입력/i), '테스트 질문');
    await user.click(screen.getByRole('button', { name: '전송' }));

    expect(addUserMessage).toHaveBeenCalledWith('테스트 질문', null);
  });

  it('renders chat messages when they exist', () => {
    vi.mocked(useStudyStore).mockReturnValue(
      makeStoreState({
        chatMessages: [
          { id: 'msg-1', role: 'user', content: '안녕하세요', pageContext: null },
          { id: 'msg-2', role: 'assistant', content: '반갑습니다!', pageContext: null },
        ],
      }),
    );

    render(<TutorTab fileId="file-1" />, { wrapper });

    expect(screen.getByText('안녕하세요')).toBeInTheDocument();
    expect(screen.getByText('반갑습니다!')).toBeInTheDocument();
  });

  it('renders new chat button in header', () => {
    render(<TutorTab fileId="file-1" />, { wrapper });

    expect(screen.getByRole('button', { name: '새 채팅' })).toBeInTheDocument();
  });
});
