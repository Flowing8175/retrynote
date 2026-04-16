import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/api/study', () => ({
  useStudyMindmap: vi.fn(),
  useStudyStatus: vi.fn(),
  useGenerateContent: vi.fn(),
}));

vi.mock('@xyflow/react', () => ({
  ReactFlow: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="react-flow">{children}</div>
  ),
  Background: () => null,
  Controls: () => null,
  Handle: () => null,
  BackgroundVariant: { Dots: 'dots' },
  Position: { Left: 'left', Right: 'right' },
}));

vi.mock('@xyflow/react/dist/style.css', () => ({}));

import { useStudyMindmap, useStudyStatus, useGenerateContent } from '@/api/study';
import { MindmapTab } from '../MindmapTab';

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function mockStatus(mindmapStatus: 'not_generated' | 'generating' | 'completed' | 'failed') {
  vi.mocked(useStudyStatus).mockReturnValue({
    data: {
      file_id: 'file-1',
      filename: 'test.pdf',
      file_type: 'pdf',
      file_status: 'ready',
      is_short_document: false,
      summary_status: 'not_generated',
      flashcards_status: 'not_generated',
      mindmap_status: mindmapStatus,
    },
  } as ReturnType<typeof useStudyStatus>);
}

describe('MindmapTab', () => {
  const mockGenerate = vi.fn();

  beforeEach(() => {
    vi.mocked(useGenerateContent).mockReturnValue({
      mutate: mockGenerate,
      isPending: false,
    } as ReturnType<typeof useGenerateContent>);
    mockStatus('not_generated');
    vi.mocked(useStudyMindmap).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useStudyMindmap>);
  });

  afterEach(() => vi.clearAllMocks());

  it('shows loading spinner when status is completed and data is loading', () => {
    mockStatus('completed');
    vi.mocked(useStudyMindmap).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as ReturnType<typeof useStudyMindmap>);

    render(<MindmapTab fileId="file-1" />, { wrapper });

    expect(screen.getByText('불러오는 중...')).toBeInTheDocument();
  });

  it('shows failed state with regenerate button', () => {
    mockStatus('failed');

    render(<MindmapTab fileId="file-1" />, { wrapper });

    expect(screen.getByText('마인드맵 생성에 실패했습니다')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /재생성/i })).toBeInTheDocument();
  });

  it('calls generate when regenerate clicked from failed state', async () => {
    mockStatus('failed');

    const user = userEvent.setup();
    render(<MindmapTab fileId="file-1" />, { wrapper });

    await user.click(screen.getByRole('button', { name: /재생성/i }));
    expect(mockGenerate).toHaveBeenCalledWith('mindmap');
  });

  it('shows not_generated state with generate button', () => {
    mockStatus('not_generated');

    render(<MindmapTab fileId="file-1" />, { wrapper });

    expect(screen.getByText('아직 마인드맵이 생성되지 않았습니다')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '마인드맵 생성' })).toBeInTheDocument();
  });

  it('shows generating state', () => {
    mockStatus('generating');

    render(<MindmapTab fileId="file-1" />, { wrapper });

    expect(screen.getByText('마인드맵을 생성하고 있습니다...')).toBeInTheDocument();
  });

  it('shows no-data state when completed but nodes array is empty', () => {
    mockStatus('completed');
    vi.mocked(useStudyMindmap).mockReturnValue({
      data: {
        data: { nodes: [], edges: [] },
        status: 'completed',
        file_id: 'file-1',
        generated_at: null,
      },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useStudyMindmap>);

    render(<MindmapTab fileId="file-1" />, { wrapper });

    expect(screen.getByText('마인드맵 데이터가 없습니다')).toBeInTheDocument();
  });

  it('renders React Flow when completed with node data', async () => {
    mockStatus('completed');
    vi.mocked(useStudyMindmap).mockReturnValue({
      data: {
        data: {
          nodes: [
            { id: 'root', type: 'root', position: { x: 0, y: 0 }, data: { label: '중심 주제' } },
          ],
          edges: [],
        },
        status: 'completed',
        file_id: 'file-1',
        generated_at: null,
      },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useStudyMindmap>);

    render(<MindmapTab fileId="file-1" />, { wrapper });

    await waitFor(() => {
      expect(screen.getByTestId('react-flow')).toBeInTheDocument();
    });
  });
});
