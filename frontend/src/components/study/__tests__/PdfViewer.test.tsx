import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';

vi.mock('@/stores/authStore', () => ({
  useAuthStore: {
    getState: () => ({ accessToken: null }),
  },
}));

vi.mock('react-pdf/dist/Page/AnnotationLayer.css', () => ({}));
vi.mock('react-pdf/dist/Page/TextLayer.css', () => ({}));

vi.mock('react-pdf', () => ({
  Document: ({
    children,
    onLoadSuccess,
  }: {
    children: React.ReactNode;
    onLoadSuccess?: (payload: {
      numPages: number;
      getPage: (n: number) => Promise<{
        getViewport: (opts: { scale: number }) => { width: number; height: number };
      }>;
    }) => void;
    onLoadError?: (error: Error) => void;
    file?: unknown;
    loading?: React.ReactNode;
    error?: React.ReactNode;
  }) => {
    useEffect(() => {
      onLoadSuccess?.({
        numPages: 5,
        getPage: async () => ({
          getViewport: () => ({ width: 612, height: 792 }),
        }),
      });
    }, []);
    return <div data-testid="pdf-document">{children}</div>;
  },
  Page: ({
    pageNumber,
    onRenderSuccess,
  }: {
    pageNumber: number;
    onRenderSuccess?: () => void;
    scale?: number;
    loading?: React.ReactNode;
    className?: string;
  }) => {
    useEffect(() => {
      onRenderSuccess?.();
    }, [pageNumber]);
    return <div data-testid="pdf-page">Page {pageNumber}</div>;
  },
  pdfjs: {
    GlobalWorkerOptions: { workerSrc: '' },
  },
}));

import { PdfViewer } from '../PdfViewer';

describe('PdfViewer', () => {
  afterEach(() => vi.clearAllMocks());

  it('shows page input with initial value of 1', () => {
    render(<PdfViewer url="/test.pdf" />);

    expect(screen.getByRole('textbox', { name: '페이지 번호' })).toHaveValue('1');
  });

  it('shows total page count after load', async () => {
    render(<PdfViewer url="/test.pdf" />);

    expect(await screen.findByText('5')).toBeInTheDocument();
  });

  it('shows zoom percentage display', () => {
    render(<PdfViewer url="/test.pdf" />);

    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('zoom in and out buttons are present', () => {
    render(<PdfViewer url="/test.pdf" />);

    expect(screen.getByRole('button', { name: '축소' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '확대' })).toBeInTheDocument();
  });

  it('zoom out button is disabled at min scale', async () => {
    const user = userEvent.setup();
    render(<PdfViewer url="/test.pdf" />);

    for (let i = 0; i < 3; i++) {
      await user.click(screen.getByRole('button', { name: '축소' }));
    }

    expect(screen.getByRole('button', { name: '축소' })).toBeDisabled();
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('zoom in button adjusts scale', async () => {
    const user = userEvent.setup();
    render(<PdfViewer url="/test.pdf" />);

    await user.click(screen.getByRole('button', { name: '확대' }));

    expect(screen.queryByText('100%')).not.toBeInTheDocument();
  });

  it('fit button is present', () => {
    render(<PdfViewer url="/test.pdf" />);

    expect(screen.getByRole('button', { name: '맞춤' })).toBeInTheDocument();
  });

  it('renders pdf document wrapper', () => {
    render(<PdfViewer url="/test.pdf" />);

    expect(screen.getByTestId('pdf-document')).toBeInTheDocument();
  });
});
