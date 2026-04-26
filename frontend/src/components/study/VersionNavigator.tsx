import { ChevronLeft, ChevronRight } from 'lucide-react';

interface VersionNavigatorProps {
  current: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}

export function VersionNavigator({ current, total, onPrev, onNext }: VersionNavigatorProps) {
  if (total <= 1) return null;

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={onPrev}
        disabled={current <= 1}
        aria-label="이전 버전"
        className="flex items-center justify-center w-6 h-6 rounded-md text-content-muted hover:text-content-secondary hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
      </button>
      <span className="text-xs text-content-muted tabular-nums min-w-[3ch] text-center">
        {current} / {total}
      </span>
      <button
        type="button"
        onClick={onNext}
        disabled={current >= total}
        aria-label="다음 버전"
        className="flex items-center justify-center w-6 h-6 rounded-md text-content-muted hover:text-content-secondary hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
