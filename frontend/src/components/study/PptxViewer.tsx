import { useState, useEffect, useRef, useCallback } from 'react';
import { AlertCircle, ZoomIn, ZoomOut, Maximize, Download } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { PPTXViewer as PptxLib } from 'pptxviewjs';

type ViewState = 'loading' | 'rendered' | 'fallback';

const PAGE_BUFFER = 3;
const PLACEHOLDER_W = 960;
const PLACEHOLDER_H = 540;
const MIN_SCALE = 0.5;
const MAX_SCALE = 2.0;
const ZOOM_STEP = 0.25;
const FIT_PADDING_PX = 16;

export function PptxViewer({ url }: { url: string }) {
  const token = useAuthStore.getState().accessToken;
  const [viewState, setViewState] = useState<ViewState>('loading');
  const [numSlides, setNumSlides] = useState<number | null>(null);
  const [currentSlide, setCurrentSlide] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [pageInputValue, setPageInputValue] = useState('1');
  const [, setRenderTick] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const isScrollingToPage = useRef(false);
  const currentSlideRef = useRef(1);
  const numSlidesRef = useRef<number | null>(null);
  const activated = useRef<Set<number>>(new Set());
  const rendered = useRef<Set<number>>(new Set());
  const slideWidth = useRef(PLACEHOLDER_W);
  const slideHeight = useRef(PLACEHOLDER_H);
  const dimsCaptured = useRef(false);
  const viewerRef = useRef<PptxLib | null>(null);
  const renderQueue = useRef<Promise<void>>(Promise.resolve());

  function zoomFit() {
    const container = scrollRef.current;
    if (!container) return;
    const availableWidth = container.clientWidth;
    const fitted = parseFloat(
      ((availableWidth - FIT_PADDING_PX) / slideWidth.current).toFixed(2),
    );
    setScale(Math.max(MIN_SCALE, Math.min(MAX_SCALE, fitted)));
  }

  // Queue slide renders sequentially: pptxviewjs holds internal state per
  // call and rejects concurrent renders.
  const renderSlideToCanvas = useCallback((slideIndex: number) => {
    renderQueue.current = renderQueue.current.then(async () => {
      const viewer = viewerRef.current;
      if (!viewer) return;
      if (rendered.current.has(slideIndex)) return;
      const canvas = canvasRefs.current.get(slideIndex);
      if (!canvas) return;
      try {
        // pptxviewjs uses 0-based slide indices; our internal numbering is 1-based.
        await viewer.renderSlide(slideIndex - 1, canvas);
        rendered.current.add(slideIndex);

        if (!dimsCaptured.current && canvas.width > 0 && canvas.height > 0) {
          const dpr = window.devicePixelRatio || 1;
          slideWidth.current = canvas.width / dpr;
          slideHeight.current = canvas.height / dpr;
          dimsCaptured.current = true;
          zoomFit();
        }
        setRenderTick((t) => t + 1);
      } catch (err) {
        console.error(`PPTX renderSlide(${slideIndex}) failed`, err);
      }
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setViewState('loading');
    setNumSlides(null);
    numSlidesRef.current = null;
    setCurrentSlide(1);
    currentSlideRef.current = 1;
    setPageInputValue('1');
    setScale(1.0);
    activated.current = new Set();
    rendered.current = new Set();
    canvasRefs.current = new Map();
    slideRefs.current = new Map();
    dimsCaptured.current = false;
    slideWidth.current = PLACEHOLDER_W;
    slideHeight.current = PLACEHOLDER_H;
    renderQueue.current = Promise.resolve();

    const abortController = new AbortController();
    const init = async () => {
      try {
        const headers: HeadersInit = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(url, { headers, signal: abortController.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        if (cancelled) return;

        const viewer = new PptxLib();
        await viewer.loadFile(buf);
        if (cancelled) return;

        viewerRef.current = viewer;
        const total = viewer.getSlideCount();
        numSlidesRef.current = total;
        setNumSlides(total);

        for (let i = 1; i <= Math.min(total, 1 + PAGE_BUFFER); i++) {
          activated.current.add(i);
        }
        setViewState('rendered');
        setRenderTick((t) => t + 1);
      } catch (err) {
        if (!cancelled) {
          console.error('PPTX load failed', err);
          setViewState('fallback');
        }
      }
    };
    init();

    return () => {
      cancelled = true;
      abortController.abort();
      renderQueue.current = Promise.resolve();
      const viewer = viewerRef.current;
      viewerRef.current = null;
      try {
        viewer?.destroy?.();
      } catch {
        void 0;
      }
    };
  }, [url, token]);

  const activateNearbySlides = useCallback(() => {
    const container = scrollRef.current;
    const total = numSlidesRef.current;
    if (!container || !total) return;

    const { scrollTop, clientHeight } = container;
    const scrollCenter = scrollTop + clientHeight / 3;

    let closest = 1;
    let closestDist = Infinity;
    slideRefs.current.forEach((el, idx) => {
      const dist = Math.abs(el.offsetTop - scrollCenter);
      if (dist < closestDist) {
        closestDist = dist;
        closest = idx;
      }
    });

    const start = Math.max(1, closest - PAGE_BUFFER);
    const end = Math.min(total, closest + PAGE_BUFFER);
    let changed = false;
    for (let i = start; i <= end; i++) {
      if (!activated.current.has(i)) {
        activated.current.add(i);
        changed = true;
      }
    }
    if (changed) setRenderTick((t) => t + 1);

    if (closest !== currentSlideRef.current) {
      currentSlideRef.current = closest;
      setCurrentSlide(closest);
      setPageInputValue(String(closest));
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
        activateNearbySlides();
        ticking = false;
      });
    };

    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, [activateNearbySlides]);

  const scrollToSlide = useCallback((page: number) => {
    const total = numSlidesRef.current;
    if (!total) return;
    const clamped = Math.max(1, Math.min(page, total));
    const el = slideRefs.current.get(clamped);
    if (el && scrollRef.current) {
      isScrollingToPage.current = true;
      for (
        let i = Math.max(1, clamped - PAGE_BUFFER);
        i <= Math.min(total, clamped + PAGE_BUFFER);
        i++
      ) {
        activated.current.add(i);
      }
      setRenderTick((t) => t + 1);
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      currentSlideRef.current = clamped;
      setCurrentSlide(clamped);
      setPageInputValue(String(clamped));
      setTimeout(() => {
        isScrollingToPage.current = false;
      }, 600);
    }
  }, []);

  function handlePageInputBlur() {
    const parsed = parseInt(pageInputValue, 10);
    if (!isNaN(parsed)) {
      scrollToSlide(parsed);
    } else {
      setPageInputValue(String(currentSlide));
    }
  }

  function handlePageInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
  }

  function zoomIn() {
    setScale((s) => Math.min(MAX_SCALE, parseFloat((s + ZOOM_STEP).toFixed(2))));
  }
  function zoomOut() {
    setScale((s) => Math.max(MIN_SCALE, parseFloat((s - ZOOM_STEP).toFixed(2))));
  }

  const setSlideRef = useCallback(
    (idx: number) => (el: HTMLDivElement | null) => {
      if (el) slideRefs.current.set(idx, el);
      else slideRefs.current.delete(idx);
    },
    [],
  );

  const setCanvasRef = useCallback(
    (idx: number) => (el: HTMLCanvasElement | null) => {
      if (el) {
        canvasRefs.current.set(idx, el);
        if (
          activated.current.has(idx) &&
          !rendered.current.has(idx) &&
          viewerRef.current
        ) {
          renderSlideToCanvas(idx);
        }
      } else {
        canvasRefs.current.delete(idx);
      }
    },
    [renderSlideToCanvas],
  );

  return (
    <div
      className="flex flex-col h-full bg-background overflow-hidden"
      data-testid="pptx-viewer"
    >
      {viewState === 'loading' && (
        <div className="flex flex-1 items-center justify-center">
          <div className="w-8 h-8 border-2 border-surface-raised border-t-brand-500 rounded-full animate-spin" />
        </div>
      )}

      {viewState === 'fallback' && (
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-4 bg-semantic-error-bg rounded-lg p-8 max-w-sm text-center">
            <AlertCircle size={32} className="text-semantic-error" />
            <p className="text-sm text-semantic-error">
              이 프레젠테이션을 미리볼 수 없습니다
            </p>
            <a
              href={url}
              download
              className="px-4 py-2 bg-semantic-error text-white rounded-lg hover:bg-semantic-error/90 transition-colors text-sm font-medium"
            >
              다운로드
            </a>
          </div>
        </div>
      )}

      <div
        className={
          viewState === 'rendered' ? 'flex flex-col flex-1 min-h-0' : 'hidden'
        }
      >
        <div className="flex items-center justify-between px-4 py-2 bg-surface/80 backdrop-blur-sm border-b border-white/[0.05] shrink-0">
          <div className="flex items-center gap-1.5 text-sm text-content-secondary">
            <input
              type="text"
              value={pageInputValue}
              onChange={(e) => setPageInputValue(e.target.value)}
              onBlur={handlePageInputBlur}
              onKeyDown={handlePageInputKeyDown}
              className="w-10 text-center bg-surface border border-white/[0.05] rounded-lg px-1 py-0.5 text-content-primary focus:outline-none focus:border-brand-500 text-sm"
              aria-label="슬라이드 번호"
            />
            <span className="text-content-muted">/</span>
            <span>{numSlides ?? '—'}</span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={zoomOut}
              disabled={scale <= MIN_SCALE}
              className="p-1.5 rounded-lg hover:bg-surface-raised disabled:opacity-40 disabled:cursor-not-allowed text-content-secondary transition-colors"
              aria-label="축소"
            >
              <ZoomOut size={16} />
            </button>
            <button
              onClick={zoomFit}
              className="text-xs text-content-muted w-12 text-center select-none hover:text-white transition-colors"
              title="화면 맞춤"
            >
              {Math.round(scale * 100)}%
            </button>
            <button
              onClick={zoomIn}
              disabled={scale >= MAX_SCALE}
              className="p-1.5 rounded-lg hover:bg-surface-raised disabled:opacity-40 disabled:cursor-not-allowed text-content-secondary transition-colors"
              aria-label="확대"
            >
              <ZoomIn size={16} />
            </button>
            <button
              onClick={zoomFit}
              className="p-1.5 rounded-lg hover:bg-surface-raised text-content-secondary transition-colors"
              aria-label="맞춤"
              title="화면 맞춤"
            >
              <Maximize size={16} />
            </button>
            <a
              href={url}
              download
              className="ml-2 p-1.5 rounded-lg hover:bg-surface-raised text-content-secondary transition-colors"
              aria-label="파일 다운로드"
            >
              <Download size={16} />
            </a>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-auto bg-background">
          <div className="flex flex-col gap-2 py-4 px-2 min-w-fit">
            {numSlides &&
              Array.from({ length: numSlides }, (_, i) => i + 1).map((idx) => {
                const w = slideWidth.current * scale;
                const h = slideHeight.current * scale;
                return (
                  <div
                    key={idx}
                    ref={setSlideRef(idx)}
                    className="shadow-lg mx-auto bg-white rounded overflow-hidden"
                    style={{ width: w, height: h }}
                  >
                    {activated.current.has(idx) ? (
                      <canvas
                        ref={setCanvasRef(idx)}
                        style={{
                          width: w,
                          height: h,
                          display: 'block',
                        }}
                      />
                    ) : (
                      <div className="flex items-center justify-center bg-surface w-full h-full">
                        <div className="w-6 h-6 border-2 border-surface-raised border-t-brand-500 rounded-full animate-spin" />
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
}
