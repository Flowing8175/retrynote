import { useState, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

interface PdfViewerProps {
  url: string;
  onPageChange?: (page: number) => void;
}

function PageSkeleton() {
  return (
    <div className="flex items-center justify-center w-full bg-surface rounded-xl animate-pulse"
      style={{ minHeight: '600px' }}>
      <div className="flex flex-col items-center gap-3 text-content-muted">
        <div className="w-8 h-8 border-2 border-surface-raised border-t-brand-500 rounded-full animate-spin" />
        <span className="text-sm">페이지 로딩 중...</span>
      </div>
    </div>
  );
}

export function PdfViewer({ url, onPageChange }: PdfViewerProps) {
  const token = useAuthStore.getState().accessToken;
  const [numPages, setNumPages] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [pageInputValue, setPageInputValue] = useState('1');
  const [isPageLoading, setIsPageLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fileOptions = {
    url,
    httpHeaders: token ? { Authorization: `Bearer ${token}` } : {},
  };

  function onDocumentLoadSuccess({ numPages: total }: { numPages: number }) {
    setNumPages(total);
    setLoadError(null);
  }

  function onDocumentLoadError(error: Error) {
    setLoadError(`PDF를 불러오지 못했습니다: ${error.message}`);
  }

  const goToPage = useCallback(
    (page: number) => {
      if (!numPages) return;
      const clamped = Math.max(1, Math.min(page, numPages));
      setCurrentPage(clamped);
      setPageInputValue(String(clamped));
      setIsPageLoading(true);
      onPageChange?.(clamped);
    },
    [numPages, onPageChange],
  );

  function handlePrev() {
    goToPage(currentPage - 1);
  }

  function handleNext() {
    goToPage(currentPage + 1);
  }

  function handlePageInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setPageInputValue(e.target.value);
  }

  function handlePageInputBlur() {
    const parsed = parseInt(pageInputValue, 10);
    if (!isNaN(parsed)) {
      goToPage(parsed);
    } else {
      setPageInputValue(String(currentPage));
    }
  }

  function handlePageInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    }
  }

  function zoomIn() {
    setScale((s) => Math.min(2.0, parseFloat((s + 0.25).toFixed(2))));
  }

  function zoomOut() {
    setScale((s) => Math.max(0.5, parseFloat((s - 0.25).toFixed(2))));
  }

  function zoomFit() {
    setScale(1.0);
  }

  const canPrev = currentPage > 1;
  const canNext = numPages !== null && currentPage < numPages;

  return (
    <div className="flex flex-col h-full bg-background rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-surface/80 backdrop-blur-sm border-b border-white/[0.05] shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrev}
            disabled={!canPrev}
            className="p-1.5 rounded-lg hover:bg-surface-raised disabled:opacity-40 disabled:cursor-not-allowed text-content-secondary transition-colors"
            aria-label="이전 페이지"
          >
            <ChevronLeft size={18} />
          </button>

          <div className="flex items-center gap-1.5 text-sm text-content-secondary">
            <input
              type="text"
              value={pageInputValue}
              onChange={handlePageInputChange}
              onBlur={handlePageInputBlur}
              onKeyDown={handlePageInputKeyDown}
              className="w-10 text-center bg-surface border border-white/[0.05] rounded-lg px-1 py-0.5 text-content-primary focus:outline-none focus:border-brand-500 text-sm"
              aria-label="페이지 번호"
            />
            <span className="text-content-muted">/</span>
            <span>{numPages ?? '—'}</span>
          </div>

          <button
            onClick={handleNext}
            disabled={!canNext}
            className="p-1.5 rounded-lg hover:bg-surface-raised disabled:opacity-40 disabled:cursor-not-allowed text-content-secondary transition-colors"
            aria-label="다음 페이지"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={zoomOut}
            disabled={scale <= 0.5}
            className="p-1.5 rounded-lg hover:bg-surface-raised disabled:opacity-40 disabled:cursor-not-allowed text-content-secondary transition-colors"
            aria-label="축소"
          >
            <ZoomOut size={16} />
          </button>

          <span className="text-xs text-content-muted w-12 text-center select-none">
            {Math.round(scale * 100)}%
          </span>

          <button
            onClick={zoomIn}
            disabled={scale >= 2.0}
            className="p-1.5 rounded-lg hover:bg-surface-raised disabled:opacity-40 disabled:cursor-not-allowed text-content-secondary transition-colors"
            aria-label="확대"
          >
            <ZoomIn size={16} />
          </button>

          <button
            onClick={zoomFit}
            className="p-1.5 rounded-lg hover:bg-surface-raised text-content-secondary transition-colors"
            aria-label="맞춤"
            title="100%로 초기화"
          >
            <Maximize size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto flex justify-center py-4 px-2 bg-background">
        {loadError ? (
          <div className="flex flex-col items-center justify-center gap-3 text-semantic-error py-16">
            <span className="text-4xl">⚠️</span>
            <p className="text-sm text-center max-w-xs">{loadError}</p>
          </div>
        ) : (
          <Document
            file={fileOptions}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading={<PageSkeleton />}
            error={
              <div className="flex flex-col items-center justify-center gap-2 text-semantic-error py-16">
                <p className="text-sm">PDF를 불러오지 못했습니다.</p>
              </div>
            }
          >
            {isPageLoading && <div className="absolute inset-0 z-10 pointer-events-none"><PageSkeleton /></div>}
            <Page
              key={`page_${currentPage}_${scale}`}
              pageNumber={currentPage}
              scale={scale}
              loading={<PageSkeleton />}
              onRenderSuccess={() => setIsPageLoading(false)}
              className="shadow-2xl"
            />
          </Document>
        )}
      </div>
    </div>
  );
}
