import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/api/study', () => ({
  useStudyMindmap: vi.fn(),
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

import { useStudyMindmap, useGenerateContent } from '@/api/study';
import { MindmapTab } from '../MindmapTab';

describe('MindmapTab', () => {
  const mockGenerate = vi.fn();

  beforeEach(() => {
    vi.mocked(useGenerateContent).mockReturnValue({
      mutate: mockGenerate,
      isPending: false,
    } as ReturnType<typeof useGenerateContent>);
  });

  afterEach(() => vi.clearAllMocks());

  it('shows loading spinner when isLoading', () => {
    vi.mocked(useStudyMindmap).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as ReturnType<typeof useStudyMindmap>);

    render(<MindmapTab fileId="file-1" />);

    expect(screen.getByText('불러오는 중...')).toBeInTheDocument();
  });

  it('shows error state when isError', () => {
    vi.mocked(useStudyMindmap).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as ReturnType<typeof useStudyMindmap>);

    render(<MindmapTab fileId="file-1" />);

    expect(screen.getByText('마인드맵을 불러오지 못했습니다')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument();
  });

  it('calls generate when retry clicked from error state', async () => {
    vi.mocked(useStudyMindmap).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as ReturnType<typeof useStudyMindmap>);

    const user = userEvent.setup();
    render(<MindmapTab fileId="file-1" />);

    await user.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(mockGenerate).toHaveBeenCalledWith('mindmap');
  });

  it('shows not_generated state with generate button', () => {
    vi.mocked(useStudyMindmap).mockReturnValue({
      data: { root: null, status: 'not_generated', file_id: 'file-1', generated_at: null },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useStudyMindmap>);

    render(<MindmapTab fileId="file-1" />);

    expect(screen.getByText('아직 마인드맵이 생성되지 않았습니다')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '마인드맵 생성' })).toBeInTheDocument();
  });

  it('shows generating state', () => {
    vi.mocked(useStudyMindmap).mockReturnValue({
      data: { root: null, status: 'generating', file_id: 'file-1', generated_at: null },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useStudyMindmap>);

    render(<MindmapTab fileId="file-1" />);

    expect(screen.getByText('마인드맵을 생성하고 있습니다...')).toBeInTheDocument();
  });

  it('shows failed state with regenerate button', () => {
    vi.mocked(useStudyMindmap).mockReturnValue({
      data: { root: null, status: 'failed', file_id: 'file-1', generated_at: null },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useStudyMindmap>);

    render(<MindmapTab fileId="file-1" />);

    expect(screen.getByText('마인드맵 생성에 실패했습니다')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '재생성' })).toBeInTheDocument();
  });

  it('renders React Flow when completed with root data', async () => {
    vi.mocked(useStudyMindmap).mockReturnValue({
      data: {
        root: { id: 'root', label: '중심 주제', children: [] },
        status: 'completed',
        file_id: 'file-1',
        generated_at: null,
      },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useStudyMindmap>);

    render(<MindmapTab fileId="file-1" />);

    await waitFor(() => {
      expect(screen.getByTestId('react-flow')).toBeInTheDocument();
    });
  });

  it('shows no-data state when completed but root is null', () => {
    vi.mocked(useStudyMindmap).mockReturnValue({
      data: { root: null, status: 'completed', file_id: 'file-1', generated_at: null },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useStudyMindmap>);

    render(<MindmapTab fileId="file-1" />);

    expect(screen.getByText('마인드맵 데이터가 없습니다')).toBeInTheDocument();
  });
});
