import { render, screen, waitFor } from '@testing-library/react';

vi.mock('@/stores/authStore', () => ({
  useAuthStore: {
    getState: () => ({ accessToken: 'test-token' }),
  },
}));

vi.mock('docx-preview', () => ({
  renderAsync: vi.fn().mockResolvedValue(undefined),
}));

import { DocxViewer } from '../DocxViewer';
import { renderAsync } from 'docx-preview';

beforeEach(() => {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    arrayBuffer: async () => new ArrayBuffer(8),
    headers: { get: () => '100' },
  });
});

afterEach(() => vi.clearAllMocks());

describe('DocxViewer', () => {
  it('renders root testid', async () => {
    render(<DocxViewer url="/test.docx" />);
    expect(await screen.findByTestId('docx-viewer')).toBeInTheDocument();
  });

  it('calls fetch with Authorization header', async () => {
    render(<DocxViewer url="/test.docx" />);
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
        })
      );
    });
  });

  it('shows error UI when fetch returns 404', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    render(<DocxViewer url="/test.docx" />);
    expect(await screen.findByText('이 문서를 미리볼 수 없습니다')).toBeInTheDocument();
  });

  it('calls renderAsync after successful fetch', async () => {
    render(<DocxViewer url="/test.docx" />);
    await waitFor(() => expect(renderAsync).toHaveBeenCalled());
  });
});
