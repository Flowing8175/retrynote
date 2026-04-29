import { useState, useEffect, useReducer } from 'react';
import Markdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { AlertCircle, Download } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const mdComponents: Components = {
  a({ href, children }) {
    return (
      <a
        href={href}
        className="text-brand-400 hover:text-brand-300 underline underline-offset-2 transition-colors"
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
      </a>
    );
  },
  strong({ children }) {
    return (
      <strong className="bg-brand-500/10 text-brand-300 px-1 rounded font-semibold not-italic">
        {children}
      </strong>
    );
  },
  h1({ children }) {
    return (
      <h1 className="text-lg font-semibold text-content-primary mt-6 mb-3 pb-1.5 border-b border-surface-border first:mt-0">
        {children}
      </h1>
    );
  },
  h2({ children }) {
    return (
      <h2 className="text-base font-semibold text-content-primary mt-5 mb-2">
        {children}
      </h2>
    );
  },
  h3({ children }) {
    return (
      <h3 className="text-sm font-semibold text-content-primary mt-4 mb-1.5">
        {children}
      </h3>
    );
  },
  h4({ children }) {
    return (
      <h4 className="text-sm font-medium text-content-primary mt-3 mb-1">
        {children}
      </h4>
    );
  },
  h5({ children }) {
    return (
      <h5 className="text-xs font-semibold text-content-primary mt-3 mb-1 uppercase tracking-wide">
        {children}
      </h5>
    );
  },
  h6({ children }) {
    return (
      <h6 className="text-xs font-medium text-content-muted mt-2 mb-1">
        {children}
      </h6>
    );
  },
  p({ children }) {
    return (
      <p className="text-sm leading-7 text-content-secondary mb-3 last:mb-0">
        {children}
      </p>
    );
  },
  ul({ children }) {
    return (
      <ul className="list-disc pl-5 space-y-1 mb-3 text-content-secondary text-sm last:mb-0">
        {children}
      </ul>
    );
  },
  ol({ children }) {
    return (
      <ol className="list-decimal pl-5 space-y-1 mb-3 text-content-secondary text-sm last:mb-0">
        {children}
      </ol>
    );
  },
  li({ children }) {
    return (
      <li className="text-content-secondary leading-relaxed">
        {children}
      </li>
    );
  },
  table({ children }) {
    return (
      <div className="overflow-x-auto mb-4 rounded-lg border border-surface-border">
        <table className="w-full text-sm border-collapse">{children}</table>
      </div>
    );
  },
  thead({ children }) {
    return <thead className="bg-surface-raised">{children}</thead>;
  },
  th({ children }) {
    return (
      <th className="text-left px-3 py-2 text-content-primary font-semibold border-b border-surface-border text-xs uppercase tracking-wider">
        {children}
      </th>
    );
  },
  td({ children }) {
    return (
      <td className="px-3 py-2 text-content-secondary border-b border-surface-border text-sm">
        {children}
      </td>
    );
  },
  pre({ children }) {
    return (
      <pre className="bg-surface-raised rounded-lg p-4 overflow-x-auto mb-3 text-xs font-mono text-content-secondary">
        {children}
      </pre>
    );
  },
  code({ children, className }) {
    const isBlock = Boolean(className);
    if (isBlock) {
      return <code className="font-mono">{children}</code>;
    }
    return (
      <code className="bg-surface-raised text-brand-300 px-1.5 py-0.5 rounded text-xs font-mono">
        {children}
      </code>
    );
  },
  blockquote({ children }) {
    return (
      <blockquote className="border-l-2 border-brand-500/40 pl-4 my-3 text-content-muted italic">
        {children}
      </blockquote>
    );
  },
  hr() {
    return <hr className="border-surface-border my-4" />;
  },
};

export function MarkdownViewer({ url }: { url: string }) {
  const token = useAuthStore.getState().accessToken;
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tooLarge, setTooLarge] = useState(false);
  const [retryCount, retry] = useReducer((c: number) => c + 1, 0);

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
          setError('마크다운을 불러오지 못했습니다');
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
      } catch (err) {
        if (controller.signal.aborted) return;
        setError('마크다운을 불러오지 못했습니다');
        setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [url, token, retryCount]);

  return (
    <div
      className="flex flex-col h-full bg-background overflow-hidden"
      data-testid="markdown-viewer"
    >
      <div className="flex-1 overflow-auto p-4">
        {loading && (
          <div className="space-y-2 animate-pulse">
            <div className="h-5 bg-surface-raised rounded w-2/5" />
            <div className="space-y-2 mt-3">
              <div className="h-3.5 bg-surface-raised rounded w-full" />
              <div className="h-3.5 bg-surface-raised rounded w-[92%]" />
              <div className="h-3.5 bg-surface-raised rounded w-[85%]" />
              <div className="h-3.5 bg-surface-raised rounded w-[78%]" />
            </div>
            <div className="h-5 bg-surface-raised rounded w-1/3 mt-4" />
            <div className="space-y-2">
              <div className="h-3.5 bg-surface-raised rounded w-full" />
              <div className="h-3.5 bg-surface-raised rounded w-[88%]" />
              <div className="h-3.5 bg-surface-raised rounded w-[72%]" />
            </div>
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
              type="button"
              onClick={retry}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-content-inverse bg-brand-500 hover:bg-brand-400 rounded-lg transition-colors"
            >
              다시 시도
            </button>
          </div>
        )}

        {!loading && !error && !tooLarge && content === '' && (
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
          <Markdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeSanitize]}
            components={mdComponents}
          >
            {content}
          </Markdown>
        )}
      </div>
    </div>
  );
}
