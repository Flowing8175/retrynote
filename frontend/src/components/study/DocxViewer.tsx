import { useState, useEffect, useRef } from 'react';
import { AlertCircle, Download } from 'lucide-react';
import { renderAsync } from 'docx-preview';
import { useAuthStore } from '@/stores/authStore';

export function DocxViewer({ url }: { url: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const token = useAuthStore.getState().accessToken;
        const headers: Record<string, string> = {};
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(url, { headers });
        if (!response.ok) {
          if (!cancelled) setError('미리볼 수 없습니다');
          return;
        }

        const buffer = await response.arrayBuffer();

        if (cancelled) return;

        if (containerRef.current) {
          containerRef.current.innerHTML = '';
          await renderAsync(buffer, containerRef.current, undefined, {
            className: 'docx-content',
            inWrapper: true,
          });
        }
      } catch (err) {
        if (!cancelled) setError('미리볼 수 없습니다');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [url]);

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden" data-testid="docx-viewer">
      {loading && (
        <div className="flex items-center justify-center py-16 flex-1">
          <div className="w-8 h-8 border-2 border-surface-raised border-t-brand-500 rounded-full animate-spin" />
        </div>
      )}

      {!loading && error && (
        <div className="flex flex-col items-center justify-center flex-1 text-center space-y-4 py-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-semantic-error-bg">
            <AlertCircle className="w-5 h-5 text-semantic-error" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-content-primary">이 문서를 미리볼 수 없습니다</p>
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

      <div
        ref={containerRef}
        className={`overflow-auto flex-1 bg-white text-black${loading || error ? ' hidden' : ''}`}
      />
    </div>
  );
}
