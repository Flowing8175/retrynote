import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/api/study', () => ({
  useStudyFlashcards: vi.fn(),
  useGenerateContent: vi.fn(),
}));

import { useStudyFlashcards, useGenerateContent } from '@/api/study';
import { FlashcardTab } from '../FlashcardTab';

const SAMPLE_CARDS = [
  { id: 'c1', front: '질문 1', back: '답변 1', hint: null, difficulty: null },
  { id: 'c2', front: '질문 2', back: '답변 2', hint: '힌트 2', difficulty: null },
  { id: 'c3', front: '질문 3', back: '답변 3', hint: null, difficulty: null },
];

describe('FlashcardTab', () => {
  const mockMutate = vi.fn();

  beforeEach(() => {
    vi.mocked(useGenerateContent).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    } as ReturnType<typeof useGenerateContent>);
  });

  afterEach(() => vi.clearAllMocks());

  it('shows loading spinner when isLoading', () => {
    vi.mocked(useStudyFlashcards).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as ReturnType<typeof useStudyFlashcards>);

    render(<FlashcardTab fileId="file-1" />);

    expect(screen.getByText('불러오는 중…')).toBeInTheDocument();
  });

  it('shows error UI when error and no data', () => {
    vi.mocked(useStudyFlashcards).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('load failed'),
    } as ReturnType<typeof useStudyFlashcards>);

    render(<FlashcardTab fileId="file-1" />);

    expect(screen.getByText('데이터를 불러오지 못했습니다.')).toBeInTheDocument();
  });

  it('shows generating state UI', () => {
    vi.mocked(useStudyFlashcards).mockReturnValue({
      data: { cards: [], status: 'generating', file_id: 'file-1', generated_at: null },
      isLoading: false,
      error: null,
    } as ReturnType<typeof useStudyFlashcards>);

    render(<FlashcardTab fileId="file-1" />);

    expect(screen.getByText('플래시카드 생성 중…')).toBeInTheDocument();
  });

  it('shows not_generated state with generate button', () => {
    vi.mocked(useStudyFlashcards).mockReturnValue({
      data: { cards: [], status: 'not_generated', file_id: 'file-1', generated_at: null },
      isLoading: false,
      error: null,
    } as ReturnType<typeof useStudyFlashcards>);

    render(<FlashcardTab fileId="file-1" />);

    expect(screen.getByText('플래시카드가 없습니다')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '플래시카드 생성' })).toBeInTheDocument();
  });

  it('calls generateContent when generate button is clicked', async () => {
    vi.mocked(useStudyFlashcards).mockReturnValue({
      data: { cards: [], status: 'not_generated', file_id: 'file-1', generated_at: null },
      isLoading: false,
      error: null,
    } as ReturnType<typeof useStudyFlashcards>);

    const user = userEvent.setup();
    render(<FlashcardTab fileId="file-1" />);

    await user.click(screen.getByRole('button', { name: '플래시카드 생성' }));
    expect(mockMutate).toHaveBeenCalledWith('flashcards');
  });

  it('shows failed state with retry button', () => {
    vi.mocked(useStudyFlashcards).mockReturnValue({
      data: { cards: [], status: 'failed', file_id: 'file-1', generated_at: null },
      isLoading: false,
      error: null,
    } as ReturnType<typeof useStudyFlashcards>);

    render(<FlashcardTab fileId="file-1" />);

    expect(screen.getByText('생성 실패')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 생성' })).toBeInTheDocument();
  });

  it('renders card front face when completed with cards', () => {
    vi.mocked(useStudyFlashcards).mockReturnValue({
      data: { cards: SAMPLE_CARDS, status: 'completed', file_id: 'file-1', generated_at: null },
      isLoading: false,
      error: null,
    } as ReturnType<typeof useStudyFlashcards>);

    render(<FlashcardTab fileId="file-1" />);

    expect(screen.getByText('질문 1')).toBeInTheDocument();
    expect(screen.getByText('답변 1')).toBeInTheDocument();
  });

  it('shows progress indicator with card count', () => {
    vi.mocked(useStudyFlashcards).mockReturnValue({
      data: { cards: SAMPLE_CARDS, status: 'completed', file_id: 'file-1', generated_at: null },
      isLoading: false,
      error: null,
    } as ReturnType<typeof useStudyFlashcards>);

    render(<FlashcardTab fileId="file-1" />);

    expect(screen.getByText('1 / 3')).toBeInTheDocument();
  });

  it('prev button is disabled on first card', () => {
    vi.mocked(useStudyFlashcards).mockReturnValue({
      data: { cards: SAMPLE_CARDS, status: 'completed', file_id: 'file-1', generated_at: null },
      isLoading: false,
      error: null,
    } as ReturnType<typeof useStudyFlashcards>);

    render(<FlashcardTab fileId="file-1" />);

    expect(screen.getByRole('button', { name: '이전 카드' })).toBeDisabled();
  });

  it('navigates to next card', async () => {
    vi.mocked(useStudyFlashcards).mockReturnValue({
      data: { cards: SAMPLE_CARDS, status: 'completed', file_id: 'file-1', generated_at: null },
      isLoading: false,
      error: null,
    } as ReturnType<typeof useStudyFlashcards>);

    const user = userEvent.setup();
    render(<FlashcardTab fileId="file-1" />);

    await user.click(screen.getByRole('button', { name: '다음 카드' }));

    expect(screen.getByText('2 / 3')).toBeInTheDocument();
    expect(screen.getByText('질문 2')).toBeInTheDocument();
  });

  it('navigates back to previous card', async () => {
    vi.mocked(useStudyFlashcards).mockReturnValue({
      data: { cards: SAMPLE_CARDS, status: 'completed', file_id: 'file-1', generated_at: null },
      isLoading: false,
      error: null,
    } as ReturnType<typeof useStudyFlashcards>);

    const user = userEvent.setup();
    render(<FlashcardTab fileId="file-1" />);

    await user.click(screen.getByRole('button', { name: '다음 카드' }));
    expect(screen.getByText('2 / 3')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '이전 카드' }));
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
  });

  it('next button is disabled on last card', async () => {
    vi.mocked(useStudyFlashcards).mockReturnValue({
      data: { cards: SAMPLE_CARDS, status: 'completed', file_id: 'file-1', generated_at: null },
      isLoading: false,
      error: null,
    } as ReturnType<typeof useStudyFlashcards>);

    const user = userEvent.setup();
    render(<FlashcardTab fileId="file-1" />);

    await user.click(screen.getByRole('button', { name: '다음 카드' }));
    await user.click(screen.getByRole('button', { name: '다음 카드' }));

    expect(screen.getByText('3 / 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다음 카드' })).toBeDisabled();
  });

  it('flips card to show back face label when clicked', async () => {
    vi.mocked(useStudyFlashcards).mockReturnValue({
      data: { cards: SAMPLE_CARDS, status: 'completed', file_id: 'file-1', generated_at: null },
      isLoading: false,
      error: null,
    } as ReturnType<typeof useStudyFlashcards>);

    const user = userEvent.setup();
    render(<FlashcardTab fileId="file-1" />);

    const flipButton = screen.getByRole('button', { name: '뒷면 보기' });
    await user.click(flipButton);

    expect(screen.getByRole('button', { name: '앞면 보기' })).toBeInTheDocument();
  });

  it('shows hint text for card that has a hint', async () => {
    vi.mocked(useStudyFlashcards).mockReturnValue({
      data: { cards: SAMPLE_CARDS, status: 'completed', file_id: 'file-1', generated_at: null },
      isLoading: false,
      error: null,
    } as ReturnType<typeof useStudyFlashcards>);

    const user = userEvent.setup();
    render(<FlashcardTab fileId="file-1" />);

    await user.click(screen.getByRole('button', { name: '다음 카드' }));

    expect(screen.getByText('힌트: 힌트 2')).toBeInTheDocument();
  });
});
