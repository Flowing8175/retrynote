import { render, screen, waitFor } from '@testing-library/react';

vi.mock('@/stores/authStore', () => ({
  useAuthStore: {
    getState: () => ({ accessToken: 'test-token' }),
  },
}));

import { MarkdownViewer } from '../MarkdownViewer';

beforeEach(() => {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => '# Hello',
    headers: { get: () => '100' },
  });
});

afterEach(() => vi.clearAllMocks());

describe('MarkdownViewer', () => {
  it('renders root testid', async () => {
    render(<MarkdownViewer url="/test.md" />);
    expect(await screen.findByTestId('markdown-viewer')).toBeInTheDocument();
  });

  it('calls fetch with Authorization header', async () => {
    render(<MarkdownViewer url="/test.md" />);
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
        })
      );
    });
  });

  it('shows error when fetch returns 404', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404, headers: { get: () => null } });
    render(<MarkdownViewer url="/test.md" />);
    expect(await screen.findByText('마크다운을 불러오지 못했습니다')).toBeInTheDocument();
  });

  it('renders markdown heading', async () => {
    render(<MarkdownViewer url="/test.md" />);
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
  });
});
