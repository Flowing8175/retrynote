import { useState } from 'react';
import Markdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { PillShimmer } from '@/components';
import type { StudyStreamingState } from '@/types/study';

const STAGE_LABELS: Record<string, string> = {
  analyzing: '학습 자료 분석 중...',
  generating: 'AI가 콘텐츠를 생성하고 있습니다...',
};

const thinkingMarkdownComponents: Components = {
  p({ children }) {
    return (
      <p className="text-sm text-content-secondary italic leading-relaxed mb-2 last:mb-0">
        {children}
      </p>
    );
  },
  strong({ children }) {
    return (
      <strong className="not-italic font-semibold text-content-primary">
        {children}
      </strong>
    );
  },
  em({ children }) {
    return <em className="italic">{children}</em>;
  },
  h1({ children }) {
    return (
      <h1 className="not-italic text-base font-semibold text-content-primary mt-3 mb-2 first:mt-0">
        {children}
      </h1>
    );
  },
  h2({ children }) {
    return (
      <h2 className="not-italic text-sm font-semibold text-content-primary mt-3 mb-1.5 first:mt-0">
        {children}
      </h2>
    );
  },
  h3({ children }) {
    return (
      <h3 className="not-italic text-sm font-semibold text-content-primary mt-2 mb-1 first:mt-0">
        {children}
      </h3>
    );
  },
  h4({ children }) {
    return (
      <h4 className="not-italic text-sm font-medium text-content-primary mt-2 mb-1 first:mt-0">
        {children}
      </h4>
    );
  },
  ul({ children }) {
    return (
      <ul className="list-disc pl-5 space-y-0.5 mb-2 text-sm italic text-content-secondary leading-relaxed last:mb-0">
        {children}
      </ul>
    );
  },
  ol({ children }) {
    return (
      <ol className="list-decimal pl-5 space-y-0.5 mb-2 text-sm italic text-content-secondary leading-relaxed last:mb-0">
        {children}
      </ol>
    );
  },
  li({ children }) {
    return <li className="leading-relaxed">{children}</li>;
  },
  a({ href, children }) {
    return (
      <a
        href={href}
        className="not-italic text-brand-400 hover:text-brand-300 underline underline-offset-2 transition-colors"
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
      </a>
    );
  },
  code({ children }) {
    return (
      <code className="not-italic bg-surface text-brand-300 px-1.5 py-0.5 rounded text-xs font-mono">
        {children}
      </code>
    );
  },
  pre({ children }) {
    return (
      <pre className="not-italic bg-surface border border-white/[0.05] rounded-lg p-3 my-2 overflow-x-auto text-xs font-mono text-content-primary">
        {children}
      </pre>
    );
  },
  blockquote({ children }) {
    return (
      <blockquote className="border-l-2 border-brand-500/40 pl-3 my-2 text-content-muted italic">
        {children}
      </blockquote>
    );
  },
  hr() {
    return <hr className="border-white/[0.05] my-3" />;
  },
  table({ children }) {
    return (
      <div className="overflow-x-auto my-2 rounded-lg border border-white/[0.05]">
        <table className="w-full text-xs not-italic border-collapse">{children}</table>
      </div>
    );
  },
  thead({ children }) {
    return <thead className="bg-surface">{children}</thead>;
  },
  th({ children }) {
    return (
      <th className="text-left px-2.5 py-1.5 text-content-primary font-medium border-b border-white/[0.05]">
        {children}
      </th>
    );
  },
  td({ children }) {
    return (
      <td className="px-2.5 py-1.5 text-content-secondary border-b border-white/[0.05]">
        {children}
      </td>
    );
  },
};

interface StudyThinkingViewProps {
  state: StudyStreamingState;
  onCancel: () => void;
}

export function StudyThinkingView({ state, onCancel }: StudyThinkingViewProps) {
  const [thinkingOpen, setThinkingOpen] = useState(true);
  const hasThinking = state.thinkingText.length > 0;
  const { stage, thinkingActive, error } = state;

  const headerLabel = thinkingActive
    ? '생각 중'
    : stage
      ? (STAGE_LABELS[stage] ?? '준비 중')
      : '준비 중';

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-surface-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-3.5 h-3.5 rounded-full bg-brand-400 animate-pulse" />
          <span className="text-sm font-medium text-content-primary">{headerLabel}</span>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-content-secondary hover:text-content-primary bg-surface-raised hover:bg-surface-hover border border-surface-border rounded-lg transition-all"
        >
          취소
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {error ? (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm font-medium text-red-400">오류가 발생했습니다</p>
            <p className="text-sm text-content-secondary">{error}</p>
          </div>
        ) : hasThinking ? (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setThinkingOpen((prev) => !prev)}
              className="flex items-center gap-2 text-sm font-medium text-content-secondary hover:text-white transition-colors"
            >
              <svg
                className={`w-4 h-4 text-brand-400 transition-transform duration-200 ${thinkingOpen ? 'rotate-0' : '-rotate-90'}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
              <span>{thinkingActive ? '생각하는 과정' : '생각한 과정'}</span>
            </button>

            <div
              className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                thinkingOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
              }`}
            >
              <div className="overflow-hidden min-h-0">
                <div className="pl-6 border-l-2 border-brand-500/30">
                  <div className="text-sm text-content-secondary italic leading-relaxed">
                    <Markdown components={thinkingMarkdownComponents} remarkPlugins={[remarkGfm]}>
                      {state.thinkingText}
                    </Markdown>
                    {thinkingActive && (
                      <span className="thinking-cursor not-italic" aria-hidden="true">
                        ▊
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="flex flex-col items-start gap-2.5 animate-fade-in-up stagger-1">
              <PillShimmer width={220} />
              <PillShimmer width={160} delay={0.3} opacity={0.75} />
              <PillShimmer width={200} delay={0.55} opacity={0.55} />
              <PillShimmer width={120} delay={0.8} opacity={0.38} />
              <PillShimmer width={80} delay={1.0} opacity={0.22} />
            </div>
            {stage && (
              <p className="text-base text-content-secondary animate-fade-in">
                {STAGE_LABELS[stage] ?? stage}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
