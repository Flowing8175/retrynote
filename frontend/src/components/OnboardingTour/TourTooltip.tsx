import { useEffect, useState } from 'react';
import type { TooltipRenderProps } from 'react-joyride';

export default function TourTooltip({
  backProps,
  primaryProps,
  skipProps,
  tooltipProps,
  step,
  index,
  isLastStep,
  size,
}: TooltipRenderProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      {...tooltipProps}
      className={[
        'relative w-full max-w-sm rounded-xl border border-white/[0.07]',
        'bg-surface p-5 shadow-2xl shadow-black/50',
        'transition-opacity duration-200 ease-out',
        visible ? 'opacity-100' : 'opacity-0',
      ].join(' ')}
    >
      {step.title && (
        <p className="mb-2 text-base font-semibold text-content-primary">
          {step.title}
        </p>
      )}

      <div className="text-sm leading-relaxed text-content-secondary">
        {step.content}
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="tabular-nums text-xs text-content-muted">
            {index + 1} / {size}
          </span>
          <button
            aria-label={skipProps['aria-label']}
            data-action={skipProps['data-action']}
            onClick={skipProps.onClick}
            title={skipProps.title}
            type="button"
            className="text-xs text-content-muted transition-colors hover:text-content-secondary"
          >
            건너뛰기
          </button>
        </div>

        <div className="flex items-center gap-2">
          {index > 0 && (
            <button
              aria-label={backProps['aria-label']}
              data-action={backProps['data-action']}
              onClick={backProps.onClick}
              title={backProps.title}
              type="button"
              className="text-sm text-content-secondary transition-colors hover:text-content-primary"
            >
              이전
            </button>
          )}
          <button
            aria-label={primaryProps['aria-label']}
            data-action={primaryProps['data-action']}
            onClick={primaryProps.onClick}
            title={primaryProps.title}
            type="button"
            className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            {isLastStep ? '완료' : '다음'}
          </button>
        </div>
      </div>
    </div>
  );
}
