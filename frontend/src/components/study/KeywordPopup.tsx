import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, RefreshCw, Sparkles, X, Send } from 'lucide-react';
import { useMindmapNodeExplanation } from '@/api/study';

export interface KeywordPopupAnchor {
  x: number;
  y: number;
}

export interface KeywordPopupNode {
  id: string;
  label: string;
}

interface KeywordPopupProps {
  fileId: string;
  node: KeywordPopupNode | null;
  anchor: KeywordPopupAnchor | null;
  onClose: () => void;
}

const POPUP_WIDTH = 340;
const POPUP_HEIGHT_ESTIMATE = 200;
const VIEWPORT_MARGIN = 16;
const ANCHOR_OFFSET = 12;

function computePopupPosition(
  anchor: KeywordPopupAnchor,
): { left: number; top: number } {
  const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const viewportH = typeof window !== 'undefined' ? window.innerHeight : 768;

  let left = anchor.x + ANCHOR_OFFSET;
  let top = anchor.y + ANCHOR_OFFSET;

  if (left + POPUP_WIDTH + VIEWPORT_MARGIN > viewportW) {
    left = anchor.x - POPUP_WIDTH - ANCHOR_OFFSET;
  }
  if (top + POPUP_HEIGHT_ESTIMATE + VIEWPORT_MARGIN > viewportH) {
    top = anchor.y - POPUP_HEIGHT_ESTIMATE - ANCHOR_OFFSET;
  }

  left = Math.max(VIEWPORT_MARGIN, Math.min(left, viewportW - POPUP_WIDTH - VIEWPORT_MARGIN));
  top = Math.max(VIEWPORT_MARGIN, Math.min(top, viewportH - POPUP_HEIGHT_ESTIMATE - VIEWPORT_MARGIN));

  return { left, top };
}

function renderInlineBold(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={i} className="font-semibold text-content-primary">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export default function KeywordPopup({ fileId, node, anchor, onClose }: KeywordPopupProps) {
  const popupRef = useRef<HTMLDivElement>(null);
  const isOpen = !!node && !!anchor;

  const position = useMemo(
    () => (anchor ? computePopupPosition(anchor) : null),
    [anchor],
  );

  const [question, setQuestion] = useState('');

  const onQuestionSubmit = () => {
    console.log('Question:', question);
    setQuestion('');
  };

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useMindmapNodeExplanation(
    fileId,
    node?.id ?? null,
    node?.label ?? null,
    { enabled: isOpen },
  );

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (popupRef.current?.contains(target)) return;
      if (target.closest('.react-flow__node')) return;
      onClose();
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [isOpen, onClose]);

  if (!isOpen || !position || !node) return null;

  const errorStatus = (error as { response?: { status?: number } } | null)?.response?.status;
  const isLimitError = errorStatus === 402;
  const showSkeleton = (isLoading || (isFetching && !data)) && !isError;

  return (
    <div
      ref={popupRef}
      role="dialog"
      aria-labelledby="keyword-popup-title"
      style={{
        position: 'fixed',
        left: position.left,
        top: position.top,
        width: POPUP_WIDTH,
        zIndex: 50,
      }}
      className="animate-scale-in rounded-2xl border border-white/[0.07] bg-surface shadow-2xl shadow-black/50 ring-1 ring-black/20"
    >
      <div className="flex items-start justify-between gap-3 border-b border-white/[0.05] px-4 pb-3 pt-3.5">
        <div className="flex min-w-0 items-center gap-2">
          <Sparkles
            size={14}
            className="shrink-0 text-brand-400"
            aria-hidden="true"
          />
          <h3
            id="keyword-popup-title"
            className="truncate text-sm font-semibold text-content-primary"
            title={node.label}
          >
            {node.label}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-content-muted transition-colors hover:bg-surface-hover hover:text-content-primary focus:outline-none"
        >
          <X size={14} />
        </button>
      </div>

      <div className="px-4 py-4">
        {showSkeleton && (
          <div className="flex flex-col gap-2" aria-label="설명 불러오는 중" role="status">
            <div className="skeleton h-3 w-full" />
            <div className="skeleton h-3 w-11/12" />
            <div className="skeleton h-3 w-4/5" />
          </div>
        )}

        {isError && (
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-2 text-sm text-semantic-error">
              <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                {isLimitError
                  ? '학습 AI 사용 한도를 초과했습니다. 요금제를 업그레이드하거나 잠시 후 다시 시도해주세요.'
                  : '설명을 불러오지 못했습니다.'}
              </span>
            </div>
            {!isLimitError && (
              <button
                type="button"
                onClick={() => refetch()}
                disabled={isFetching}
                className="inline-flex items-center gap-1.5 self-start rounded-lg border border-white/[0.07] bg-surface-raised px-3 py-1.5 text-xs font-medium text-content-secondary transition-colors hover:border-white/[0.14] hover:text-content-primary disabled:opacity-50"
              >
                <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} />
                다시 시도
              </button>
            )}
          </div>
        )}

        {data && !isError && (
          <>
            <p className="text-sm leading-relaxed text-content-secondary animate-fade-in">
              {renderInlineBold(data.explanation)}
            </p>

            <div className="mt-3 border-t border-white/[0.05] pt-3">
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && question.trim()) {
                    e.preventDefault();
                    onQuestionSubmit();
                  }
                }}
                placeholder="추가 질문하기..."
                rows={2}
                className="w-full resize-none rounded-xl border border-white/[0.07] bg-surface-raised px-3 py-2 text-sm text-content-primary placeholder:text-content-muted focus:border-brand-400/50 focus:outline-none focus:ring-1 focus:ring-brand-400/20 transition-colors"
              />
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={onQuestionSubmit}
                  disabled={!question.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.07] bg-surface-raised px-3 py-1.5 text-xs font-medium text-content-secondary transition-colors hover:border-brand-400/30 hover:text-brand-400 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Send size={11} />
                  질문
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
