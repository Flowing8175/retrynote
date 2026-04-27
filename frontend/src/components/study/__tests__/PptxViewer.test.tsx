import { render, screen, waitFor } from '@testing-library/react';

vi.mock('@/stores/authStore', () => ({
  useAuthStore: {
    getState: () => ({ accessToken: 'test-token' }),
  },
}));

vi.mock('pptxviewjs', () => ({
  PPTXViewer: vi.fn().mockImplementation(() => ({
    loadFile: vi.fn().mockResolvedValue(undefined),
    render: vi.fn().mockResolvedValue(undefined),
    getSlideCount: vi.fn().mockReturnValue(1),
    getCurrentSlideIndex: vi.fn().mockReturnValue(0),
    nextSlide: vi.fn().mockResolvedValue(undefined),
    previousSlide: vi.fn().mockResolvedValue(undefined),
  })),
}));

import { PptxViewer } from '../PptxViewer';

beforeEach(() => {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    arrayBuffer: async () => new ArrayBuffer(8),
    headers: { get: () => '100' },
  });
});

afterEach(() => vi.clearAllMocks());

describe('PptxViewer', () => {
  it('renders root testid', async () => {
    render(<PptxViewer url="/test.pptx" />);
    expect(await screen.findByTestId('pptx-viewer')).toBeInTheDocument();
  });

  it('calls fetch with Authorization header', async () => {
    render(<PptxViewer url="/test.pptx" />);
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
        })
      );
    });
  });

  it('shows fallback error UI when fetch returns 404', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    render(<PptxViewer url="/test.pptx" />);
    expect(await screen.findByText('이 프레젠테이션을 미리볼 수 없습니다')).toBeInTheDocument();
  });

  it('shows slide navigation after successful render', async () => {
    render(<PptxViewer url="/test.pptx" />);
    expect(await screen.findByLabelText('이전 슬라이드')).toBeInTheDocument();
  });
});
