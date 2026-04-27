import { render, screen, waitFor } from '@testing-library/react';

vi.mock('@/stores/authStore', () => ({
  useAuthStore: {
    getState: () => ({ accessToken: 'test-token' }),
  },
}));

import { TextViewer } from '../TextViewer';

beforeEach(() => {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => 'hello',
    headers: { get: () => '100' },
  });
});

afterEach(() => vi.clearAllMocks());

describe('TextViewer', () => {
  it('renders root testid', async () => {
    render(<TextViewer url="/test.txt" />);
    expect(await screen.findByTestId('text-viewer')).toBeInTheDocument();
  });

  it('calls fetch with Authorization header', async () => {
    render(<TextViewer url="/test.txt" />);
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
    render(<TextViewer url="/test.txt" />);
    expect(await screen.findByText('텍스트를 불러오지 못했습니다')).toBeInTheDocument();
  });

  it('renders fetched text content', async () => {
    render(<TextViewer url="/test.txt" />);
    expect(await screen.findByText('hello')).toBeInTheDocument();
  });
});
