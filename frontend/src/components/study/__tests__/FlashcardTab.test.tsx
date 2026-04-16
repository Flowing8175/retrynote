import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/api/study', () => ({
  useStudyFlashcards: vi.fn(),
  useStudyStatus: vi.fn(),
  useGenerateContent: vi.fn(),
}));

import { useStudyFlashcards, useStudyStatus, useGenerateContent } from '@/api/study';
import { FlashcardTab } from '../FlashcardTab';

const SAMPLE_CARDS = [
  { id: 'c1', front: '질문 1', back: '답변 1', hint: null, difficulty: null },
  { id: 'c2', front: '질문 2', back: '답변 2', hint: '힌트 2', difficulty: null },
  { id: 'c3', front: '질문 3', back: '답변 3', hint: null, difficulty: null },
];

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function mockStatus(flashcardsStatus: 'not_generated' | 'generating' | 'completed' | 'failed') {
  vi.mocked(useStudyStatus).mockReturnValue({
    data: {
      file_id: 'file-1',
      filename: 'test.pdf',
      file_type: 'pdf',
      file_status: 'ready',
      is_short_document: false,
      summary_status: 'not_generated',
      flashcards_status: flashcardsStatus,
      mindmap_status: 'not_generated',
    },
  } as ReturnType<typeof useStudyStatus>);
}

describe('FlashcardTab', () => {
  const mockMutate = vi.fn();

  beforeEach(() => {
    vi.mocked(useGenerateContent).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    } as ReturnType<typeof useGenerateContent>);
    mockStatus('not_generated');
    vi.mocked(useStudyFlashcards).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    } as ReturnType<typeof useStudyFlashcards>);
  });

  afterEach(() => vi.clearAllMocks());

  it('shows loading spinner when status is completed and data is loading', () => {
    mockStatus('completed');
    vi.mocked(useStudyFlashcards).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as ReturnType<typeof useStudyFlashcards>);

    render(<FlashcardTab fileId="file-1" />, { wrapper });

    expect(screen.getByText('플래시카드 생성 중…')).toBeInTheDocument();
  });

  it('shows generating state UI', () => {
    mockStatus('generating');

    render(<FlashcardTab fileId="file-1" />, { wrapper });

    expect(screen.getByText('플래시카드 생성 중…')).toBeInTheDocument();
  });

  it('shows not_generated state with generate button', () => {
    mockStatus('not_generated');

    render(<FlashcardTab fileId="file-1" />, { wrapper });

    expect(screen.getByText('플래시카드가 없습니다')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '플래시카드 생성' })).toBeInTheDocument();
  });

  it('calls generateContent when generate button is clicked', async () => {
    mockStatus('not_generated');

    const user = userEvent.setup();
    render(<FlashcardTab fileId="file-1" />, { wrapper });

    await user.click(screen.getByRole('button', { name: '플래시카드 생성' }));
    expect(mockMutate).toHaveBeenCalledWith('flashcards');
  });

  it('shows failed state with retry button', () => {
    mockStatus('failed');

    render(<FlashcardTab fileId="file-1" />, { wrapper });

    expect(screen.getByText('생성 실패')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 생성' })).toBeInTheDocument();
  });

  it('renders card front face when completed with cards', () => {
    mockStatus('completed');
    vi.mocked(useStudyFlashcards).mockReturnValue({
      data: { cards: SAMPLE_CARDS, status: 'completed', file_id: 'file-1', generated_at: null },
      isLoading: false,
      error: null,
    } as ReturnType<typeof useStudyFlashcards>);

    render(<FlashcardTab fileId="file-1" />, { wrapper });

    expect(screen.getByText('질문 1')).toBeInTheDocument();
    expect(screen.getByText('답변 1')).toBeInTheDocument();
  });

  it('shows progress indicator with card count', () => {
    mockStatus('completed');
    vi.mocked(useStudyFlashcards).mockReturnValue({
      data: { cards: SAMPLE_CARDS, status: 'completed', file_id: 'file-1', generated_at: null },
      isLoading: false,
      error: null,
    } as ReturnType<typeof useStudyFlashcards>);

    render(<FlashcardTab fileId="file-1" />, { wrapper });

    expect(screen.getByText('1 / 3')).toBeInTheDocument();
  });

  it('prev button is disabled on first card', () => {
    mockStatus('completed');
    vi.mocked(useStudyFlashcards).mockReturnValue({
      data: { cards: SAMPLE_CARDS, status: 'completed', file_id: 'file-1', generated_at: null },
      isLoading: false,
      error: null,
    } as ReturnType<typeof useStudyFlashcards>);

    render(<FlashcardTab fileId="file-1" />, { wrapper });

    expect(screen.getByRole('button', { name: '이전 카드' })).toBeDisabled();
  });

  it('navigates to next card', async () => {
    mockStatus('completed');
    vi.mocked(useStudyFlashcards).mockReturnValue({
      data: { cards: SAMPLE_CARDS, status: 'completed', file_id: 'file-1', generated_at: null },
      isLoading: false,
      error: null,
    } as ReturnType<typeof useStudyFlashcards>);

    const user = userEvent.setup();
    render(<FlashcardTab fileId="file-1" />, { wrapper });

    await user.click(screen.getByRole('button', { name: '다음 카드' }));

    expect(screen.getByText('2 / 3')).toBeInTheDocument();
    expect(screen.getByText('질문 2')).toBeInTheDocument();
  });

  it('navigates back to previous card', async () => {
    mockStatus('completed');
    vi.mocked(useStudyFlashcards).mockReturnValue({
      data: { cards: SAMPLE_CARDS, status: 'completed', file_id: 'file-1', generated_at: null },
      isLoading: false,
      error: null,
    } as ReturnType<typeof useStudyFlashcards>);

    const user = userEvent.setup();
    render(<FlashcardTab fileId="file-1" />, { wrapper });

    await user.click(screen.getByRole('button', { name: '다음 카드' }));
    expect(screen.getByText('2 / 3')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '이전 카드' }));
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
  });

  it('next button is disabled on last card', async () => {
    mockStatus('completed');
    vi.mocked(useStudyFlashcards).mockReturnValue({
      data: { cards: SAMPLE_CARDS, status: 'completed', file_id: 'file-1', generated_at: null },
      isLoading: false,
      error: null,
    } as ReturnType<typeof useStudyFlashcards>);

    const user = userEvent.setup();
    render(<FlashcardTab fileId="file-1" />, { wrapper });

    await user.click(screen.getByRole('button', { name: '다음 카드' }));
    await user.click(screen.getByRole('button', { name: '다음 카드' }));

    expect(screen.getByText('3 / 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다음 카드' })).toBeDisabled();
  });

  it('flips card to show back face label when clicked', async () => {
    mockStatus('completed');
    vi.mocked(useStudyFlashcards).mockReturnValue({
      data: { cards: SAMPLE_CARDS, status: 'completed', file_id: 'file-1', generated_at: null },
      isLoading: false,
      error: null,
    } as ReturnType<typeof useStudyFlashcards>);

    const user = userEvent.setup();
    render(<FlashcardTab fileId="file-1" />, { wrapper });

    const flipButton = screen.getByRole('button', { name: '뒷면 보기' });
    await user.click(flipButton);

    expect(screen.getByRole('button', { name: '앞면 보기' })).toBeInTheDocument();
  });

  it('shows hint text for card that has a hint', async () => {
    mockStatus('completed');
    vi.mocked(useStudyFlashcards).mockReturnValue({
      data: { cards: SAMPLE_CARDS, status: 'completed', file_id: 'file-1', generated_at: null },
      isLoading: false,
      error: null,
    } as ReturnType<typeof useStudyFlashcards>);

    const user = userEvent.setup();
    render(<FlashcardTab fileId="file-1" />, { wrapper });

    await user.click(screen.getByRole('button', { name: '다음 카드' }));

    expect(screen.getByText('힌트: 힌트 2')).toBeInTheDocument();
  });
});
