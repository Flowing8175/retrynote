import { useMemo } from 'react';
import Markdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { RefreshCw, FileText, AlertCircle, Sparkles } from 'lucide-react';
import { useStudySummary, useGenerateContent } from '@/api/study';

interface SummaryTabProps {
  fileId: string;
  onPageNavigate?: (page: number) => void;
}

function SummarySkeleton() {
  return (
    <div className="space-y-4 animate-pulse p-1">
      <div className="h-5 bg-surface-raised rounded w-2/5" />
      <div className="space-y-2">
        <div className="h-3.5 bg-surface-raised rounded w-full" />
        <div className="h-3.5 bg-surface-raised rounded w-[92%]" />
        <div className="h-3.5 bg-surface-raised rounded w-[85%]" />
        <div className="h-3.5 bg-surface-raised rounded w-[78%]" />
      </div>
      <div className="h-5 bg-surface-raised rounded w-1/3 mt-3" />
      <div className="space-y-2">
        <div className="h-3.5 bg-surface-raised rounded w-full" />
        <div className="h-3.5 bg-surface-raised rounded w-[88%]" />
        <div className="h-3.5 bg-surface-raised rounded w-[94%]" />
        <div className="h-3.5 bg-surface-raised rounded w-[72%]" />
      </div>
      <div className="h-5 bg-surface-raised rounded w-2/5 mt-3" />
      <div className="space-y-2">
        <div className="h-3.5 bg-surface-raised rounded w-full" />
        <div className="h-3.5 bg-surface-raised rounded w-[82%]" />
        <div className="h-3.5 bg-surface-raised rounded w-[90%]" />
        <div className="h-3.5 bg-surface-raised rounded w-[68%]" />
      </div>
    </div>
  );
}

export function SummaryTab({ fileId, onPageNavigate }: SummaryTabProps) {
  const { data: summary, isLoading, isError } = useStudySummary(fileId);
  const { mutate: generateContent, isPending: isGenerating } = useGenerateContent(fileId);

  const processedContent = useMemo(() => {
    if (!summary?.content) return '';
    return summary.content.replace(/\(p\.(\d+)\)/g, '[p.$1](#page-$1)');
  }, [summary?.content]);

  const markdownComponents: Components = useMemo(
    () => ({
      a({ href, children }) {
        const pageMatch = href?.match(/^#page-(\d+)$/);
        if (pageMatch && onPageNavigate) {
          const pageNum = parseInt(pageMatch[1], 10);
          return (
            <button
              type="button"
              onClick={() => onPageNavigate(pageNum)}
              className="inline text-brand-400 hover:text-brand-300 underline underline-offset-2 font-medium transition-colors cursor-pointer"
            >
              {children}
            </button>
          );
        }
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
      code({ children }) {
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
    }),
    [onPageNavigate],
  );

  const isShowingLoader = isLoading || summary?.status === 'generating';
  const effectiveStatus = isLoading
    ? 'generating'
    : isError
      ? 'failed'
      : (summary?.status ?? 'not_generated');

  const canRegenerate = effectiveStatus === 'completed' || effectiveStatus === 'failed';

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-surface-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <FileText className="w-3.5 h-3.5 text-brand-400" />
          <span className="text-sm font-medium text-content-primary">요약</span>
          {effectiveStatus === 'generating' && (
            <span className="text-xs text-content-muted">생성 중...</span>
          )}
        </div>
        {canRegenerate && (
          <button
            type="button"
            onClick={() => generateContent('summary')}
            disabled={isGenerating}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-content-secondary hover:text-content-primary bg-surface-raised hover:bg-surface-hover border border-surface-border rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-3 h-3 ${isGenerating ? 'animate-spin' : ''}`} />
            다시 생성
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {isShowingLoader && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-content-secondary">
              <Sparkles className="w-4 h-4 text-brand-400 animate-pulse flex-shrink-0" />
              <span>요약을 생성하고 있습니다...</span>
            </div>
            <SummarySkeleton />
          </div>
        )}

        {!isShowingLoader && effectiveStatus === 'completed' && summary?.content && (
          <Markdown components={markdownComponents} remarkPlugins={[remarkGfm]}>
            {processedContent}
          </Markdown>
        )}

        {!isShowingLoader && effectiveStatus === 'failed' && (
          <div className="flex flex-col items-center justify-center min-h-[200px] text-center space-y-4 py-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-semantic-error-bg">
              <AlertCircle className="w-5 h-5 text-semantic-error" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-content-primary">요약 생성에 실패했습니다</p>
              <p className="text-xs text-content-muted">잠시 후 다시 시도해주세요</p>
            </div>
            <button
              type="button"
              onClick={() => generateContent('summary')}
              disabled={isGenerating}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-content-inverse bg-brand-500 hover:bg-brand-400 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
              다시 생성
            </button>
          </div>
        )}

        {!isShowingLoader && effectiveStatus === 'not_generated' && (
          <div className="flex flex-col items-center justify-center min-h-[200px] text-center space-y-4 py-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500/10">
              <FileText className="w-5 h-5 text-brand-400" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-content-primary">요약이 생성되지 않았습니다</p>
              <p className="text-xs text-content-muted">아래 버튼을 눌러 AI 요약을 생성하세요</p>
            </div>
            <button
              type="button"
              onClick={() => generateContent('summary')}
              disabled={isGenerating}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-content-inverse bg-brand-500 hover:bg-brand-400 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Sparkles className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
              요약 생성
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
