import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/api/study', () => ({
  useStudySummary: vi.fn(),
  useStudyStatus: vi.fn(),
  useGenerateContent: vi.fn(),
}));

vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => (
    <div data-testid="markdown-content">{children}</div>
  ),
}));

vi.mock('remark-gfm', () => ({ default: () => {} }));

import { useStudySummary, useStudyStatus, useGenerateContent } from '@/api/study';
import { SummaryTab } from '../SummaryTab';

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function mockStatus(summaryStatus: 'not_generated' | 'generating' | 'completed' | 'failed') {
  vi.mocked(useStudyStatus).mockReturnValue({
    data: {
      file_id: 'file-1',
      filename: 'test.pdf',
      file_type: 'pdf',
      file_status: 'ready',
      is_short_document: false,
      summary_status: summaryStatus,
      flashcards_status: 'not_generated',
      mindmap_status: 'not_generated',
    },
  } as ReturnType<typeof useStudyStatus>);
}

describe('SummaryTab', () => {
  const mockMutate = vi.fn();

  beforeEach(() => {
    vi.mocked(useGenerateContent).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    } as ReturnType<typeof useGenerateContent>);
    mockStatus('not_generated');
    vi.mocked(useStudySummary).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useStudySummary>);
  });

  afterEach(() => vi.clearAllMocks());

  it('shows loading skeleton when summary is being fetched after completion', () => {
    mockStatus('completed');
    vi.mocked(useStudySummary).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as ReturnType<typeof useStudySummary>);

    render(<SummaryTab fileId="file-1" />, { wrapper });

    expect(screen.getByText('요약을 생성하고 있습니다...')).toBeInTheDocument();
  });

  it('shows loading skeleton when summary status is generating', () => {
    mockStatus('generating');

    render(<SummaryTab fileId="file-1" />, { wrapper });

    expect(screen.getByText('요약을 생성하고 있습니다...')).toBeInTheDocument();
  });

  it('shows error state when status is failed', () => {
    mockStatus('failed');

    render(<SummaryTab fileId="file-1" />, { wrapper });

    expect(screen.getByText('요약 생성에 실패했습니다')).toBeInTheDocument();
  });

  it('shows not_generated state with generate button', () => {
    mockStatus('not_generated');

    render(<SummaryTab fileId="file-1" />, { wrapper });

    expect(screen.getByText('요약이 생성되지 않았습니다')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '요약 생성' })).toBeInTheDocument();
  });

  it('renders markdown content when completed', () => {
    mockStatus('completed');
    vi.mocked(useStudySummary).mockReturnValue({
      data: {
        status: 'completed',
        content: '# 요약 내용\n본문입니다.',
        file_id: 'file-1',
        generated_at: '2024-01-01',
      },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useStudySummary>);

    render(<SummaryTab fileId="file-1" />, { wrapper });

    expect(screen.getByTestId('markdown-content')).toBeInTheDocument();
  });

  it('shows regenerate button in header when completed', () => {
    mockStatus('completed');
    vi.mocked(useStudySummary).mockReturnValue({
      data: {
        status: 'completed',
        content: '내용',
        file_id: 'file-1',
        generated_at: '2024-01-01',
      },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useStudySummary>);

    render(<SummaryTab fileId="file-1" />, { wrapper });

    expect(screen.getByRole('button', { name: /다시 생성/i })).toBeInTheDocument();
  });

  it('calls generateContent with "summary" when regenerate clicked', async () => {
    mockStatus('completed');
    vi.mocked(useStudySummary).mockReturnValue({
      data: {
        status: 'completed',
        content: '내용',
        file_id: 'file-1',
        generated_at: '2024-01-01',
      },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useStudySummary>);

    const user = userEvent.setup();
    render(<SummaryTab fileId="file-1" />, { wrapper });

    await user.click(screen.getByRole('button', { name: /다시 생성/i }));
    expect(mockMutate).toHaveBeenCalledWith('summary');
  });

  it('calls generateContent when retry clicked from failed state', async () => {
    mockStatus('failed');

    const user = userEvent.setup();
    render(<SummaryTab fileId="file-1" />, { wrapper });

    const buttons = screen.getAllByRole('button', { name: /다시 생성/i });
    await user.click(buttons[0]);
    expect(mockMutate).toHaveBeenCalledWith('summary');
  });

  it('does not show regenerate header button when not_generated', () => {
    mockStatus('not_generated');

    render(<SummaryTab fileId="file-1" />, { wrapper });

    expect(screen.queryByRole('button', { name: /다시 생성/i })).not.toBeInTheDocument();
  });
});
