import { useState, useCallback, useRef, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

interface PdfViewerProps {
  url: string;
  onPageChange?: (page: number) => void;
}

export function PdfViewer({ url, onPageChange }: PdfViewerProps) {
  const token = useAuthStore.getState().accessToken;
  const [numPages, setNumPages] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [pageInputValue, setPageInputValue] = useState('1');
  const [loadError, setLoadError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const isScrollingToPage = useRef(false);

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

  // Track which page is visible via scroll position
  const handleScroll = useCallback(() => {
    if (isScrollingToPage.current || !scrollRef.current || !numPages) return;
    const container = scrollRef.current;
    const scrollTop = container.scrollTop;
    const containerHeight = container.clientHeight;
    const scrollCenter = scrollTop + containerHeight / 3;

    let closestPage = 1;
    let closestDistance = Infinity;

    pageRefs.current.forEach((el, pageNum) => {
      const distance = Math.abs(el.offsetTop - scrollCenter);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestPage = pageNum;
      }
    });

    if (closestPage !== currentPage) {
      setCurrentPage(closestPage);
      setPageInputValue(String(closestPage));
      onPageChange?.(closestPage);
    }
  }, [currentPage, numPages, onPageChange]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const scrollToPage = useCallback((page: number) => {
    if (!numPages) return;
    const clamped = Math.max(1, Math.min(page, numPages));
    const el = pageRefs.current.get(clamped);
    if (el && scrollRef.current) {
      isScrollingToPage.current = true;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setCurrentPage(clamped);
      setPageInputValue(String(clamped));
      onPageChange?.(clamped);
      setTimeout(() => { isScrollingToPage.current = false; }, 500);
    }
  }, [numPages, onPageChange]);

  function handlePageInputBlur() {
    const parsed = parseInt(pageInputValue, 10);
    if (!isNaN(parsed)) {
      scrollToPage(parsed);
    } else {
      setPageInputValue(String(currentPage));
    }
  }

  function handlePageInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
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

  const setPageRef = useCallback((pageNum: number) => (el: HTMLDivElement | null) => {
    if (el) pageRefs.current.set(pageNum, el);
    else pageRefs.current.delete(pageNum);
  }, []);

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-surface/80 backdrop-blur-sm border-b border-white/[0.05] shrink-0">
        <div className="flex items-center gap-1.5 text-sm text-content-secondary">
          <input
            type="text"
            value={pageInputValue}
            onChange={(e) => setPageInputValue(e.target.value)}
            onBlur={handlePageInputBlur}
            onKeyDown={handlePageInputKeyDown}
            className="w-10 text-center bg-surface border border-white/[0.05] rounded-lg px-1 py-0.5 text-content-primary focus:outline-none focus:border-brand-500 text-sm"
            aria-label="페이지 번호"
          />
          <span className="text-content-muted">/</span>
          <span>{numPages ?? '—'}</span>
        </div>

        <div className="flex items-center gap-1">
          <button onClick={zoomOut} disabled={scale <= 0.5} className="p-1.5 rounded-lg hover:bg-surface-raised disabled:opacity-40 disabled:cursor-not-allowed text-content-secondary transition-colors" aria-label="축소">
            <ZoomOut size={16} />
          </button>
          <span className="text-xs text-content-muted w-12 text-center select-none">{Math.round(scale * 100)}%</span>
          <button onClick={zoomIn} disabled={scale >= 2.0} className="p-1.5 rounded-lg hover:bg-surface-raised disabled:opacity-40 disabled:cursor-not-allowed text-content-secondary transition-colors" aria-label="확대">
            <ZoomIn size={16} />
          </button>
          <button onClick={zoomFit} className="p-1.5 rounded-lg hover:bg-surface-raised text-content-secondary transition-colors" aria-label="맞춤" title="100%로 초기화">
            <Maximize size={16} />
          </button>
        </div>
      </div>

      {/* Scrollable pages */}
      <div ref={scrollRef} className="flex-1 overflow-auto bg-background">
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
            loading={
              <div className="flex items-center justify-center py-16">
                <div className="w-8 h-8 border-2 border-surface-raised border-t-brand-500 rounded-full animate-spin" />
              </div>
            }
            error={
              <div className="flex flex-col items-center justify-center gap-2 text-semantic-error py-16">
                <p className="text-sm">PDF를 불러오지 못했습니다.</p>
              </div>
            }
          >
            <div className="flex flex-col items-center gap-2 py-4 px-2">
              {numPages && Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
                <div key={pageNum} ref={setPageRef(pageNum)} className="shadow-lg">
                  <Page
                    pageNumber={pageNum}
                    scale={scale}
                    className="bg-white"
                    loading={
                      <div className="flex items-center justify-center bg-surface rounded" style={{ width: 595 * scale, height: 842 * scale }}>
                        <div className="w-6 h-6 border-2 border-surface-raised border-t-brand-500 rounded-full animate-spin" />
                      </div>
                    }
                  />
                </div>
              ))}
            </div>
          </Document>
        )}
      </div>
    </div>
  );
}
