import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/api/study', () => ({
  useStudySummary: vi.fn(),
  useGenerateContent: vi.fn(),
}));

vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => (
    <div data-testid="markdown-content">{children}</div>
  ),
}));

vi.mock('remark-gfm', () => ({ default: () => {} }));

import { useStudySummary, useGenerateContent } from '@/api/study';
import { SummaryTab } from '../SummaryTab';

describe('SummaryTab', () => {
  const mockMutate = vi.fn();

  beforeEach(() => {
    vi.mocked(useGenerateContent).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    } as ReturnType<typeof useGenerateContent>);
  });

  afterEach(() => vi.clearAllMocks());

  it('shows loading skeleton when isLoading is true', () => {
    vi.mocked(useStudySummary).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as ReturnType<typeof useStudySummary>);

    render(<SummaryTab fileId="file-1" />);

    expect(screen.getByText('요약을 생성하고 있습니다...')).toBeInTheDocument();
  });

  it('shows loading skeleton when summary status is generating', () => {
    vi.mocked(useStudySummary).mockReturnValue({
      data: { status: 'generating', content: '', file_id: 'file-1', generated_at: null },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useStudySummary>);

    render(<SummaryTab fileId="file-1" />);

    expect(screen.getByText('요약을 생성하고 있습니다...')).toBeInTheDocument();
  });

  it('shows error state when isError is true', () => {
    vi.mocked(useStudySummary).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as ReturnType<typeof useStudySummary>);

    render(<SummaryTab fileId="file-1" />);

    expect(screen.getByText('요약 생성에 실패했습니다')).toBeInTheDocument();
  });

  it('shows not_generated state with generate button', () => {
    vi.mocked(useStudySummary).mockReturnValue({
      data: { status: 'not_generated', content: '', file_id: 'file-1', generated_at: null },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useStudySummary>);

    render(<SummaryTab fileId="file-1" />);

    expect(screen.getByText('요약이 생성되지 않았습니다')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '요약 생성' })).toBeInTheDocument();
  });

  it('renders markdown content when completed', () => {
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

    render(<SummaryTab fileId="file-1" />);

    expect(screen.getByTestId('markdown-content')).toBeInTheDocument();
  });

  it('shows regenerate button in header when completed', () => {
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

    render(<SummaryTab fileId="file-1" />);

    expect(screen.getByRole('button', { name: /다시 생성/i })).toBeInTheDocument();
  });

  it('calls generateContent with "summary" when regenerate clicked', async () => {
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
    render(<SummaryTab fileId="file-1" />);

    await user.click(screen.getByRole('button', { name: /다시 생성/i }));
    expect(mockMutate).toHaveBeenCalledWith('summary');
  });

  it('calls generateContent when retry clicked from error state', async () => {
    vi.mocked(useStudySummary).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as ReturnType<typeof useStudySummary>);

    const user = userEvent.setup();
    render(<SummaryTab fileId="file-1" />);

    const buttons = screen.getAllByRole('button', { name: /다시 생성/i });
    await user.click(buttons[0]);
    expect(mockMutate).toHaveBeenCalledWith('summary');
  });

  it('does not show regenerate header button when not_generated', () => {
    vi.mocked(useStudySummary).mockReturnValue({
      data: { status: 'not_generated', content: '', file_id: 'file-1', generated_at: null },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useStudySummary>);

    render(<SummaryTab fileId="file-1" />);

    expect(screen.queryByRole('button', { name: /다시 생성/i })).not.toBeInTheDocument();
  });
});
