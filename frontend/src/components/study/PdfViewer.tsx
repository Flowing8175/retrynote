import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

const PAGE_BUFFER = 3;
const PLACEHOLDER_W = 595;
const PLACEHOLDER_H = 842;

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
  const [, setRenderTick] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const isScrollingToPage = useRef(false);
  const currentPageRef = useRef(1);
  const numPagesRef = useRef<number | null>(null);
  const onPageChangeRef = useRef(onPageChange);
  onPageChangeRef.current = onPageChange;
  const activated = useRef(new Set<number>());
  const pageWidth = useRef(PLACEHOLDER_W);
  const pageHeight = useRef(PLACEHOLDER_H);
  const userZoomedManually = useRef(false);
  const lastFittedWidth = useRef(0);

  const fileOptions = useMemo(() => ({
    url,
    httpHeaders: token ? { Authorization: `Bearer ${token}` } : {},
  }), [url, token]);

  function onDocumentLoadSuccess(pdf: { numPages: number; getPage: (n: number) => Promise<{ getViewport: (opts: { scale: number }) => { width: number; height: number } }> }) {
    const total = pdf.numPages;
    setNumPages(total);
    numPagesRef.current = total;
    setLoadError(null);
    for (let i = 1; i <= Math.min(total, 1 + PAGE_BUFFER); i++) {
      activated.current.add(i);
    }
    setRenderTick(t => t + 1);

    pdf.getPage(1).then((page) => {
      const viewport = page.getViewport({ scale: 1 });
      pageWidth.current = viewport.width;
      pageHeight.current = viewport.height;
      // Auto-fit on load now that we know the real page size
      zoomFit();
    }).catch(() => { /* keep placeholder defaults */ });
  }

  function onDocumentLoadError(error: Error) {
    setLoadError(`PDF를 불러오지 못했습니다: ${error.message}`);
  }

  const activateNearbyPages = useCallback(() => {
    const container = scrollRef.current;
    const total = numPagesRef.current;
    if (!container || !total) return;

    const { scrollTop, clientHeight } = container;
    const scrollCenter = scrollTop + clientHeight / 3;

    let closestPage = 1;
    let closestDistance = Infinity;
    pageRefs.current.forEach((el, pageNum) => {
      const dist = Math.abs(el.offsetTop - scrollCenter);
      if (dist < closestDistance) {
        closestDistance = dist;
        closestPage = pageNum;
      }
    });

    const start = Math.max(1, closestPage - PAGE_BUFFER);
    const end = Math.min(total, closestPage + PAGE_BUFFER);
    let changed = false;
    for (let i = start; i <= end; i++) {
      if (!activated.current.has(i)) {
        activated.current.add(i);
        changed = true;
      }
    }
    if (changed) setRenderTick(t => t + 1);

    if (closestPage !== currentPageRef.current) {
      currentPageRef.current = closestPage;
      setCurrentPage(closestPage);
      setPageInputValue(String(closestPage));
      onPageChangeRef.current?.(closestPage);
    }
  }, []);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    let ticking = false;
    const onScroll = () => {
      if (isScrollingToPage.current || ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        activateNearbyPages();
        ticking = false;
      });
    };

    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, [activateNearbyPages]);

  const scrollToPage = useCallback((page: number) => {
    const total = numPagesRef.current;
    if (!total) return;
    const clamped = Math.max(1, Math.min(page, total));
    const el = pageRefs.current.get(clamped);
    if (el && scrollRef.current) {
      isScrollingToPage.current = true;
      for (let i = Math.max(1, clamped - PAGE_BUFFER); i <= Math.min(total, clamped + PAGE_BUFFER); i++) {
        activated.current.add(i);
      }
      setRenderTick(t => t + 1);
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      currentPageRef.current = clamped;
      setCurrentPage(clamped);
      setPageInputValue(String(clamped));
      onPageChangeRef.current?.(clamped);
      setTimeout(() => { isScrollingToPage.current = false; }, 600);
    }
  }, []);

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
    userZoomedManually.current = true;
    setScale((s) => Math.min(2.0, parseFloat((s + 0.25).toFixed(2))));
  }
  function zoomOut() {
    userZoomedManually.current = true;
    setScale((s) => Math.max(0.5, parseFloat((s - 0.25).toFixed(2))));
  }
  const zoomFit = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    const origOverflowY = container.style.overflowY;
    container.style.overflowY = 'scroll';
    const availableWidth = container.clientWidth;
    container.style.overflowY = origOverflowY;
    if (availableWidth <= 0) return;
    const HORIZONTAL_PADDING = 16;
    const fitted = parseFloat(((availableWidth - HORIZONTAL_PADDING) / pageWidth.current).toFixed(2));
    lastFittedWidth.current = availableWidth;
    setScale(Math.max(0.5, Math.min(2.0, fitted)));
  }, []);

  function handleManualFit() {
    userZoomedManually.current = false;
    zoomFit();
  }

  useEffect(() => {
    const container = scrollRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const width = entry.contentRect.width;
      if (width <= 0) return;
      if (Math.abs(width - lastFittedWidth.current) < 2) return;
      if (userZoomedManually.current) {
        lastFittedWidth.current = width;
        return;
      }
      zoomFit();
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [zoomFit]);

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
          <button onClick={handleManualFit} className="text-xs text-content-muted w-12 text-center select-none hover:text-white transition-colors" title="화면 맞춤">{Math.round(scale * 100)}%</button>
          <button onClick={zoomIn} disabled={scale >= 2.0} className="p-1.5 rounded-lg hover:bg-surface-raised disabled:opacity-40 disabled:cursor-not-allowed text-content-secondary transition-colors" aria-label="확대">
            <ZoomIn size={16} />
          </button>
          <button onClick={handleManualFit} className="p-1.5 rounded-lg hover:bg-surface-raised text-content-secondary transition-colors" aria-label="화면 맞춤" title="화면 맞춤">
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
            <div className="flex flex-col gap-2 py-4 px-2">
              {numPages && Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
                <div key={pageNum} ref={setPageRef(pageNum)} className="shadow-lg mx-auto">
                  {activated.current.has(pageNum) ? (
                    <Page
                      pageNumber={pageNum}
                      scale={scale}
                      className="bg-white"
                      loading={
                        <div className="flex items-center justify-center bg-surface rounded" style={{ width: pageWidth.current * scale, height: pageHeight.current * scale }}>
                          <div className="w-6 h-6 border-2 border-surface-raised border-t-brand-500 rounded-full animate-spin" />
                        </div>
                      }
                    />
                  ) : (
                    <div
                      className="flex items-center justify-center bg-surface rounded"
                      style={{ width: pageWidth.current * scale, height: pageHeight.current * scale }}
                    />
                  )}
                </div>
              ))}
            </div>
          </Document>
        )}
      </div>
    </div>
  );
}
