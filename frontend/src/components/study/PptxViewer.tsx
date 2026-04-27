import { useState, useEffect, useRef, useCallback } from 'react';
import { AlertCircle, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { PPTXViewer as PptxLib } from 'pptxviewjs';

type ViewState = 'loading' | 'rendered' | 'fallback';

export function PptxViewer({ url }: { url: string }) {
  const token = useAuthStore.getState().accessToken;
  const [viewState, setViewState] = useState<ViewState>('loading');
  const [currentSlide, setCurrentSlide] = useState(0);
  const [totalSlides, setTotalSlides] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<PptxLib | null>(null);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      setViewState('loading');
      setCurrentSlide(0);
      setTotalSlides(0);

      try {
        const headers: HeadersInit = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(url, { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = await res.arrayBuffer();

        if (cancelled) return;
        if (!canvasRef.current) throw new Error('canvas not ready');

        const viewer = new PptxLib();
        await viewer.loadFile(buf);

        if (cancelled) return;

        await viewer.render(canvasRef.current);

        if (cancelled) return;

        viewerRef.current = viewer;
        setTotalSlides(viewer.getSlideCount());
        setCurrentSlide(viewer.getCurrentSlideIndex());
        setViewState('rendered');
      } catch {
        if (!cancelled) setViewState('fallback');
      }
    };

    init();

    return () => {
      cancelled = true;
      viewerRef.current = null;
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
    };
  }, [url, token]);

  const handlePrev = useCallback(async () => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    try {
      await viewer.previousSlide(canvasRef.current);
      setCurrentSlide(viewer.getCurrentSlideIndex());
    } catch {
      setViewState('fallback');
    }
  }, []);

  const handleNext = useCallback(async () => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    try {
      await viewer.nextSlide(canvasRef.current);
      setCurrentSlide(viewer.getCurrentSlideIndex());
    } catch {
      setViewState('fallback');
    }
  }, []);

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden" data-testid="pptx-viewer">
      {viewState === 'loading' && (
        <div className="flex flex-1 items-center justify-center">
          <div className="w-8 h-8 border-2 border-surface-raised border-t-brand-500 rounded-full animate-spin" />
        </div>
      )}

      {viewState === 'fallback' && (
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-4 bg-semantic-error-bg rounded-lg p-8 max-w-sm text-center">
            <AlertCircle size={32} className="text-semantic-error" />
            <p className="text-sm text-semantic-error">이 프레젠테이션을 미리볼 수 없습니다</p>
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

      <div className={viewState === 'rendered' ? 'flex flex-col flex-1 min-h-0' : 'hidden'}>
        <div className="flex items-center justify-center gap-3 px-4 py-2 bg-surface/80 backdrop-blur-sm border-b border-white/[0.05] shrink-0">
          <button
            onClick={handlePrev}
            disabled={currentSlide <= 0}
            className="p-1.5 rounded-lg hover:bg-surface-raised disabled:opacity-40 disabled:cursor-not-allowed text-content-secondary transition-colors"
            aria-label="이전 슬라이드"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-xs text-content-muted select-none tabular-nums">
            {currentSlide + 1} / {totalSlides}
          </span>
          <button
            onClick={handleNext}
            disabled={currentSlide >= totalSlides - 1}
            className="p-1.5 rounded-lg hover:bg-surface-raised disabled:opacity-40 disabled:cursor-not-allowed text-content-secondary transition-colors"
            aria-label="다음 슬라이드"
          >
            <ChevronRight size={16} />
          </button>
          <a
            href={url}
            download
            className="ml-4 p-1.5 rounded-lg hover:bg-surface-raised text-content-secondary transition-colors"
            aria-label="파일 다운로드"
          >
            <Download size={16} />
          </a>
        </div>

        <div className="flex-1 overflow-auto flex items-center justify-center bg-background p-4">
          <canvas ref={canvasRef} className="max-w-full shadow-lg rounded" />
        </div>
      </div>
    </div>
  );
}
