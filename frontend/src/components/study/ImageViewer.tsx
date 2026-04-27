import { useState, useCallback, useRef, useEffect } from 'react';
import { ZoomIn, ZoomOut, Maximize, AlertCircle } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';

interface ImageViewerProps {
  url: string;
}

export function ImageViewer({ url }: ImageViewerProps) {
  const token = useAuthStore.getState().accessToken;
  const [scale, setScale] = useState(1.0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  
  const imgRef = useRef<HTMLImageElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevObjectUrlRef = useRef<string | null>(null);

  // Fetch image with auth token
  useEffect(() => {
    setLoading(true);
    setError(null);

    const fetchImage = async () => {
      try {
        const fetchOptions: RequestInit = {};
        if (token) {
          fetchOptions.headers = { Authorization: `Bearer ${token}` };
        }
        const response = await fetch(url, fetchOptions);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const blob = await response.blob();
        const newObjectUrl = URL.createObjectURL(blob);
        
        // Revoke previous object URL
        if (prevObjectUrlRef.current) {
          URL.revokeObjectURL(prevObjectUrlRef.current);
        }
        
        prevObjectUrlRef.current = newObjectUrl;
        setObjectUrl(newObjectUrl);
        setLoading(false);
      } catch (err) {
        setError('이미지를 불러오지 못했습니다');
        setLoading(false);
      }
    };

    fetchImage();

    // Cleanup on unmount or url change
    return () => {
      if (prevObjectUrlRef.current) {
        URL.revokeObjectURL(prevObjectUrlRef.current);
        prevObjectUrlRef.current = null;
      }
    };
  }, [url, token]);

  const handleZoomIn = useCallback(() => {
    setScale((s) => Math.min(2.0, parseFloat((s + 0.25).toFixed(2))));
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale((s) => Math.max(0.5, parseFloat((s - 0.25).toFixed(2))));
  }, []);

  const handleFitToWidth = useCallback(() => {
    if (!imgRef.current || !scrollRef.current) {
      setScale(1.0);
      return;
    }

    const naturalWidth = imgRef.current.naturalWidth;
    if (naturalWidth > 0) {
      const containerWidth = scrollRef.current.clientWidth;
      const padding = 16; // px-2 on inner wrapper = 8px each side
      const fitted = parseFloat(((containerWidth - padding) / naturalWidth).toFixed(2));
      setScale(Math.max(0.5, Math.min(2.0, fitted)));
    } else {
      setScale(1.0);
    }
  }, []);

  const handleMaximize = useCallback(() => {
    setScale(1.0);
  }, []);

  const handleRetry = useCallback(() => {
    setLoading(true);
    setError(null);
  }, []);

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden" data-testid="image-viewer">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-surface/80 backdrop-blur-sm border-b border-white/[0.05] shrink-0">
        <div className="flex items-center gap-1.5 text-sm text-content-secondary">
          <span className="text-content-muted">이미지</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleZoomOut}
            disabled={scale <= 0.5}
            className="p-1.5 rounded-lg hover:bg-surface-raised disabled:opacity-40 disabled:cursor-not-allowed text-content-secondary transition-colors"
            aria-label="축소"
          >
            <ZoomOut size={16} />
          </button>
          <button
            onClick={handleFitToWidth}
            className="text-xs text-content-muted w-12 text-center select-none hover:text-white transition-colors"
            title="화면 맞춤"
          >
            {Math.round(scale * 100)}%
          </button>
          <button
            onClick={handleZoomIn}
            disabled={scale >= 2.0}
            className="p-1.5 rounded-lg hover:bg-surface-raised disabled:opacity-40 disabled:cursor-not-allowed text-content-secondary transition-colors"
            aria-label="확대"
          >
            <ZoomIn size={16} />
          </button>
          <button
            onClick={handleMaximize}
            className="p-1.5 rounded-lg hover:bg-surface-raised text-content-secondary transition-colors"
            aria-label="맞춤"
            title="100%로 초기화"
          >
            <Maximize size={16} />
          </button>
        </div>
      </div>

      {/* Content area */}
      <div ref={scrollRef} className="flex-1 overflow-auto bg-background flex items-center justify-center">
        {loading && !error && (
          <div className="w-full h-64 bg-surface animate-pulse rounded" />
        )}

        {error && (
          <div className="flex flex-col items-center justify-center gap-4 bg-semantic-error-bg rounded-lg p-8 max-w-sm">
            <AlertCircle size={32} className="text-semantic-error" />
            <p className="text-sm text-semantic-error text-center">{error}</p>
            <button
              onClick={handleRetry}
              className="px-4 py-2 bg-semantic-error text-white rounded-lg hover:bg-semantic-error/90 transition-colors text-sm font-medium"
            >
              다시 시도
            </button>
          </div>
        )}

        {objectUrl && !error && (
          <div className="flex items-center justify-center p-4">
            <img
              ref={imgRef}
              src={objectUrl}
              alt="Viewer"
              style={{
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
              }}
              className="max-w-full max-h-full"
              onLoad={() => setLoading(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
