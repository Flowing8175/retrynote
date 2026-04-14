import { render, screen, waitFor, act } from '@testing-library/react';
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
    onLoadSuccess?: (payload: { numPages: number }) => void;
    onLoadError?: (error: Error) => void;
    file?: unknown;
    loading?: React.ReactNode;
    error?: React.ReactNode;
  }) => {
    useEffect(() => {
      onLoadSuccess?.({ numPages: 5 });
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

  it('prev button is disabled on page 1', () => {
    render(<PdfViewer url="/test.pdf" />);

    expect(screen.getByRole('button', { name: '이전 페이지' })).toBeDisabled();
  });

  it('shows page input with initial value of 1', () => {
    render(<PdfViewer url="/test.pdf" />);

    expect(screen.getByRole('textbox', { name: '페이지 번호' })).toHaveValue('1');
  });

  it('next button becomes enabled after document loads', async () => {
    render(<PdfViewer url="/test.pdf" />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '다음 페이지' })).not.toBeDisabled();
    });
  });

  it('navigates to next page when next button clicked', async () => {
    const user = userEvent.setup();
    render(<PdfViewer url="/test.pdf" />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '다음 페이지' })).not.toBeDisabled();
    });

    await user.click(screen.getByRole('button', { name: '다음 페이지' }));

    expect(screen.getByRole('textbox', { name: '페이지 번호' })).toHaveValue('2');
  });

  it('navigates back when prev button clicked from page 2', async () => {
    const user = userEvent.setup();
    render(<PdfViewer url="/test.pdf" />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '다음 페이지' })).not.toBeDisabled();
    });

    await user.click(screen.getByRole('button', { name: '다음 페이지' }));
    expect(screen.getByRole('textbox', { name: '페이지 번호' })).toHaveValue('2');

    await user.click(screen.getByRole('button', { name: '이전 페이지' }));
    expect(screen.getByRole('textbox', { name: '페이지 번호' })).toHaveValue('1');
  });

  it('shows total page count after load', async () => {
    render(<PdfViewer url="/test.pdf" />);

    await waitFor(() => {
      expect(screen.getByText('5')).toBeInTheDocument();
    });
  });

  it('calls onPageChange callback when navigating', async () => {
    const onPageChange = vi.fn();
    const user = userEvent.setup();
    render(<PdfViewer url="/test.pdf" onPageChange={onPageChange} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '다음 페이지' })).not.toBeDisabled();
    });

    await user.click(screen.getByRole('button', { name: '다음 페이지' }));
    expect(onPageChange).toHaveBeenCalledWith(2);
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

  it('accepts direct page input on blur', async () => {
    const user = userEvent.setup();
    render(<PdfViewer url="/test.pdf" />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '다음 페이지' })).not.toBeDisabled();
    });

    const input = screen.getByRole('textbox', { name: '페이지 번호' });
    await user.clear(input);
    await user.type(input, '3');
    await act(async () => {
      input.blur();
    });

    expect(input).toHaveValue('3');
  });
});
