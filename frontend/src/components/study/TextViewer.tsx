import { useState, useEffect, useReducer } from 'react';
import { AlertCircle, Download } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

interface TextViewerProps {
  url: string;
}

type FontSize = 'sm' | 'md' | 'lg';

export function TextViewer({ url }: TextViewerProps) {
  const token = useAuthStore.getState().accessToken;
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fontSize, setFontSize] = useState<FontSize>('md');
  const [tooLarge, setTooLarge] = useState(false);
  const [retryCount, retry] = useReducer((c: number) => c + 1, 0);

  const fontSizeMap: Record<FontSize, string> = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
  };

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setContent('');
    setTooLarge(false);

    (async () => {
      try {
        const headers: Record<string, string> = {};
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(url, { headers, signal: controller.signal });

        if (!response.ok) {
          setError('텍스트를 불러오지 못했습니다');
          setLoading(false);
          return;
        }

        const contentLength = response.headers.get('content-length');
        if (contentLength && parseInt(contentLength, 10) > MAX_FILE_SIZE) {
          setTooLarge(true);
          setLoading(false);
          return;
        }

        const text = await response.text();
        if (controller.signal.aborted) return;
        setContent(text);
        setLoading(false);
      } catch {
        if (controller.signal.aborted) return;
        setError('텍스트를 불러오지 못했습니다');
        setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [url, token, retryCount]);

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden" data-testid="text-viewer">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-surface/80 backdrop-blur-sm border-b border-white/[0.05] shrink-0">
        <div className="text-xs text-content-muted">텍스트 뷰어</div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setFontSize('sm')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              fontSize === 'sm'
                ? 'bg-brand-500 text-content-inverse'
                : 'hover:bg-surface-raised text-content-secondary'
            }`}
          >
            작게
          </button>
          <button
            onClick={() => setFontSize('md')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              fontSize === 'md'
                ? 'bg-brand-500 text-content-inverse'
                : 'hover:bg-surface-raised text-content-secondary'
            }`}
          >
            보통
          </button>
          <button
            onClick={() => setFontSize('lg')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              fontSize === 'lg'
                ? 'bg-brand-500 text-content-inverse'
                : 'hover:bg-surface-raised text-content-secondary'
            }`}
          >
            크게
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-auto bg-background">
        {loading && (
          <div className="space-y-2 p-4">
            <div className="h-4 bg-surface animate-pulse rounded w-3/4" />
            <div className="h-4 bg-surface animate-pulse rounded w-full" />
            <div className="h-4 bg-surface animate-pulse rounded w-5/6" />
            <div className="h-4 bg-surface animate-pulse rounded w-4/5" />
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center justify-center min-h-[200px] text-center space-y-4 py-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-semantic-error-bg">
              <AlertCircle className="w-5 h-5 text-semantic-error" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-content-primary">{error}</p>
              <p className="text-xs text-content-muted">잠시 후 다시 시도해주세요</p>
            </div>
            <button
              onClick={retry}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-content-inverse bg-brand-500 hover:bg-brand-400 rounded-lg transition-colors"
            >
              다시 시도
            </button>
          </div>
        )}

        {!loading && !error && content === '' && !tooLarge && (
          <div className="flex flex-col items-center justify-center min-h-[200px] text-center space-y-4 py-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-raised">
              <span className="text-xl">📄</span>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-content-primary">파일이 비어 있습니다</p>
            </div>
          </div>
        )}

        {!loading && tooLarge && (
          <div className="flex flex-col items-center justify-center min-h-[200px] text-center space-y-4 py-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-semantic-warning-bg">
              <span className="text-xl">⚠️</span>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-content-primary">파일이 너무 큽니다</p>
              <p className="text-xs text-content-muted">다운로드하여 확인하세요</p>
            </div>
            <a
              href={url}
              download
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-content-inverse bg-brand-500 hover:bg-brand-400 rounded-lg transition-colors"
            >
              <Download size={16} />
              다운로드
            </a>
          </div>
        )}

        {!loading && !error && content && (
          <pre className={`whitespace-pre-wrap break-words font-mono ${fontSizeMap[fontSize]} text-content-primary p-4`}>
            {content}
          </pre>
        )}
      </div>
    </div>
  );
}
