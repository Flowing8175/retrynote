import { render, screen, waitFor } from '@testing-library/react';

vi.mock('@/stores/authStore', () => ({
  useAuthStore: {
    getState: () => ({ accessToken: 'test-token' }),
  },
}));

import { ImageViewer } from '../ImageViewer';

beforeEach(() => {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    blob: async () => new Blob(['x']),
    headers: { get: () => '100' },
  });
  URL.createObjectURL = vi.fn().mockReturnValue('blob:test');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => vi.clearAllMocks());

describe('ImageViewer', () => {
  it('renders root testid', async () => {
    render(<ImageViewer url="/test.png" />);
    expect(await screen.findByTestId('image-viewer')).toBeInTheDocument();
  });

  it('calls fetch with Authorization header', async () => {
    render(<ImageViewer url="/test.png" />);
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
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    render(<ImageViewer url="/test.png" />);
    expect(await screen.findByText('이미지를 불러오지 못했습니다')).toBeInTheDocument();
  });

  it('calls revokeObjectURL on unmount', async () => {
    const { unmount } = render(<ImageViewer url="/test.png" />);
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });
});
