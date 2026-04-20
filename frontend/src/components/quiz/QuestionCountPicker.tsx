import { useId } from 'react';
import { Check } from 'lucide-react';

interface QuestionCountPickerProps {
  questionCount: number;
  autoCount: boolean;
  onChange: (value: number | 'auto') => void;
  autoLabel?: string;
  autoDescription?: string;
}

const MIN = 5;
const MAX = 20;
const MARKS = [5, 10, 15, 20] as const;
const THUMB_RADIUS_PX = 10;

const BRAND_500_OKLCH = 'oklch(0.65 0.15 175)';
const TRACK_BG_OKLCH = 'oklch(1 0 0 / 0.06)';

export function QuestionCountPicker({
  questionCount,
  autoCount,
  onChange,
  autoLabel = 'AI 결정',
  autoDescription = 'AI가 분량에 맞게 자동 선택',
}: QuestionCountPickerProps) {
  const sliderId = useId();
  const safe = Number.isFinite(questionCount) ? questionCount : MIN;
  const clamped = Math.max(MIN, Math.min(MAX, safe));
  const fillPct = ((clamped - MIN) / (MAX - MIN)) * 100;

  const trackStyle = {
    background: `linear-gradient(to right, ${BRAND_500_OKLCH} 0%, ${BRAND_500_OKLCH} ${fillPct}%, ${TRACK_BG_OKLCH} ${fillPct}%, ${TRACK_BG_OKLCH} 100%)`,
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => onChange(autoCount ? clamped : 'auto')}
        aria-pressed={autoCount}
        className={`flex w-full items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
          autoCount
            ? 'bg-brand-500/10 text-brand-300 border-brand-500/30'
            : 'bg-transparent text-content-secondary border-white/[0.05] hover:bg-white/[0.05]'
        }`}
      >
        <span
          className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
            autoCount
              ? 'border-brand-500/50 bg-brand-500/20 text-brand-300'
              : 'border-white/[0.12] bg-transparent text-transparent'
          }`}
        >
          <Check size={10} strokeWidth={3} />
        </span>
        <span className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">{autoLabel}</span>
          <span className={`text-xs ${autoCount ? 'text-brand-400' : 'text-content-muted'}`}>
            {autoDescription}
          </span>
        </span>
      </button>

      <div
        className={`rounded-2xl border border-white/[0.05] bg-surface-deep/70 px-4 pt-3 pb-4 transition-opacity ${
          autoCount ? 'pointer-events-none select-none opacity-40' : ''
        }`}
        aria-hidden={autoCount}
      >
        <div className="mb-3 flex items-baseline justify-between">
          <label htmlFor={sliderId} className="text-xs font-medium text-content-muted">
            문제 수
          </label>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-semibold leading-none text-brand-300 tabular-nums">
              {clamped}
            </span>
            <span className="text-sm text-content-muted">개</span>
          </div>
        </div>

        <input
          id={sliderId}
          type="range"
          min={MIN}
          max={MAX}
          step={1}
          value={clamped}
          onChange={(e) => onChange(Number(e.target.value))}
          disabled={autoCount}
          aria-label="문제 수"
          aria-valuemin={MIN}
          aria-valuemax={MAX}
          aria-valuenow={clamped}
          className="quiz-count-slider w-full"
          style={trackStyle}
        />

        <div
          className="relative mt-3 h-5"
          style={{ marginLeft: THUMB_RADIUS_PX, marginRight: THUMB_RADIUS_PX }}
        >
          {MARKS.map((m) => {
            const markPct = ((m - MIN) / (MAX - MIN)) * 100;
            const isActive = !autoCount && clamped === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => onChange(m)}
                disabled={autoCount}
                aria-label={`${m}개 선택`}
                className={`absolute -translate-x-1/2 rounded px-1.5 py-0.5 text-[11px] font-medium tabular-nums transition-colors ${
                  isActive
                    ? 'text-brand-300'
                    : 'text-content-muted hover:text-content-secondary'
                }`}
                style={{ left: `${markPct}%` }}
              >
                {m}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
