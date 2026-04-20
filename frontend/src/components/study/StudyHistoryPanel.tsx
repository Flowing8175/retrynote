import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { X, BookOpen, ChevronRight, Clock } from 'lucide-react';
import { useStudyHistory } from '@/api/study';
import { formatFileSize } from '@/utils/formatters';

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return '방금 전';
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}일 전`;
  const week = Math.floor(day / 7);
  if (week < 5) return `${week}주 전`;
  const month = Math.floor(day / 30);
  if (month < 12) return `${month}개월 전`;
  return `${Math.floor(day / 365)}년 전`;
}

interface StudyHistoryPanelProps {
  open: boolean;
  onClose: () => void;
}

export function StudyHistoryPanel({ open, onClose }: StudyHistoryPanelProps) {
  // `visible` keeps DOM mounted during exit; `entered` drives the CSS transition state
  const [visible, setVisible] = useState(false);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (open) {
      setVisible(true);
      // Two rAF frames let the browser paint the element at its initial
      // translate-x-full position before the transition to translate-x-0 fires.
      let cancelled = false;
      const raf1 = requestAnimationFrame(() => {
        if (!cancelled) {
          requestAnimationFrame(() => {
            if (!cancelled) setEntered(true);
          });
        }
      });
      return () => {
        cancelled = true;
        cancelAnimationFrame(raf1);
      };
    } else {
      setEntered(false);
      const t = setTimeout(() => setVisible(false), 400);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Escape key closes the panel
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Body scroll lock
  useEffect(() => {
    if (open) {
      document.body.classList.add('overflow-hidden');
    }
    return () => {
      document.body.classList.remove('overflow-hidden');
    };
  }, [open]);

  const { data, isLoading, isError, refetch } = useStudyHistory(20, { enabled: open });

  if (!visible) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className={[
          'fixed inset-0 z-40 bg-black/50 backdrop-blur-sm',
          'transition-opacity duration-[400ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none',
          entered ? 'opacity-100' : 'opacity-0',
        ].join(' ')}
      />

      {/* Slide-in panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="학습 기록"
        className={[
          'fixed right-0 top-0 bottom-0 z-50 flex flex-col',
          'w-full sm:w-96 lg:w-[420px]',
          'bg-surface border-l border-white/[0.05] shadow-2xl',
          'transition-transform duration-[400ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none',
          entered ? 'translate-x-0' : 'translate-x-full',
        ].join(' ')}
      >
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-white/[0.05] shrink-0">
          <h2 className="text-base font-semibold text-white">학습 기록</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex items-center justify-center w-8 h-8 rounded-lg text-content-muted hover:text-white hover:bg-surface-hover transition-colors"
          >
            <X size={18} />
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {/* Loading skeleton */}
          {isLoading && (
            <div className="animate-pulse" aria-hidden="true">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 px-6 py-4 border-b border-white/[0.03]"
                >
                  <div className="skeleton h-8 w-8 rounded-lg shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="skeleton h-3.5 w-3/4 rounded" />
                    <div className="skeleton h-3 w-1/2 rounded" />
                  </div>
                  <div className="skeleton h-4 w-4 rounded shrink-0" />
                </div>
              ))}
            </div>
          )}

          {/* Error state */}
          {isError && (
            <div className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
              <p className="text-sm text-content-muted">학습 기록을 불러오지 못했습니다.</p>
              <button
                type="button"
                onClick={() => void refetch()}
                className="text-xs font-medium text-brand-300 hover:text-white transition-colors"
              >
                다시 시도
              </button>
            </div>
          )}

          {/* Empty state */}
          {!isLoading && !isError && data?.items.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center h-full">
              <Clock size={32} className="text-content-muted/40" />
              <p className="text-sm text-content-muted leading-relaxed max-w-[220px]">
                아직 학습한 자료가 없습니다. 자료를 선택해 학습을 시작하세요.
              </p>
            </div>
          )}

          {/* History list */}
          {!isLoading && !isError && data && data.items.length > 0 && (
            <ul>
              {data.items.map((item, i) => (
                <li key={item.file_id}>
                  <Link
                    to={`/study/${item.file_id}`}
                    onClick={onClose}
                    className="flex items-center gap-3 px-6 py-3 hover:bg-surface-hover transition-colors border-b border-white/[0.03] animate-fade-in-up"
                    style={{ animationDelay: `${i * 40}ms`, animationDuration: '300ms' }}
                  >
                    <BookOpen size={18} className="text-brand-300 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-content-primary truncate">
                        {item.original_filename ?? '제목 없는 자료'}
                      </p>
                      <p className="text-xs text-content-muted mt-0.5">
                        {relativeTime(item.last_visited_at)} · {formatFileSize(item.file_size_bytes)}
                      </p>
                    </div>
                    <ChevronRight size={16} className="text-content-muted shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
