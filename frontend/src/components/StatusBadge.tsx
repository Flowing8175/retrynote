interface StatusBadgeProps {
  status: string;
}

interface StatusConfig {
  label: string;
  className: string;
  dotClassName: string;
  pulse?: boolean;
}

const labelMap: Record<string, string> = {
  uploaded: '업로드됨',
  parsing: '파싱 중',
  parsed: '파싱 완료',
  ocr_pending: 'OCR 대기',
  ocr_processing: 'OCR 처리 중',
  embedding_pending: '임베딩 대기',
  embedding_processing: '임베딩 중',
  ready: '준비 완료',
  failed_partial: '부분 실패',
  failed_terminal: '처리 실패',
  deleted: '삭제됨',
  draft: '초안',
  generating: '생성 중',
  in_progress: '진행 중',
  submitted: '제출됨',
  grading: '채점 중',
  graded: '채점 완료',
  objection_pending: '이의제기 대기',
  regraded: '재채점 완료',
  closed: '종료',
  generation_failed: '생성 실패',
  active: '활성',
  inactive: '비활성',
  correct: '정답',
  incorrect: '오답',
  partial: '부분정답',
  info: '정보',
  warning: '주의',
  error: '오류',
  debug: '디버그',
  critical: '치명',
};

const statusConfigMap: Record<string, StatusConfig> = {
  uploaded: {
    label: labelMap.uploaded,
    className: 'border-brand-500/20 bg-brand-500/10 text-brand-300',
    dotClassName: 'bg-brand-400',
  },
  parsing: {
    label: labelMap.parsing,
    className: 'border-semantic-warning-border bg-semantic-warning-bg text-semantic-warning',
    dotClassName: 'bg-semantic-warning',
    pulse: true,
  },
  parsed: {
    label: labelMap.parsed,
    className: 'border-semantic-success-border bg-semantic-success-bg text-semantic-success',
    dotClassName: 'bg-semantic-success',
  },
  ocr_pending: {
    label: labelMap.ocr_pending,
    className: 'border-semantic-warning-border bg-semantic-warning-bg text-semantic-warning',
    dotClassName: 'bg-semantic-warning',
    pulse: true,
  },
  ocr_processing: {
    label: labelMap.ocr_processing,
    className: 'border-semantic-warning-border bg-semantic-warning-bg text-semantic-warning',
    dotClassName: 'bg-semantic-warning',
    pulse: true,
  },
  embedding_pending: {
    label: labelMap.embedding_pending,
    className: 'border-semantic-warning-border bg-semantic-warning-bg text-semantic-warning',
    dotClassName: 'bg-semantic-warning',
    pulse: true,
  },
  embedding_processing: {
    label: labelMap.embedding_processing,
    className: 'border-semantic-warning-border bg-semantic-warning-bg text-semantic-warning',
    dotClassName: 'bg-semantic-warning',
    pulse: true,
  },
  ready: {
    label: labelMap.ready,
    className: 'border-semantic-success-border bg-semantic-success-bg text-semantic-success',
    dotClassName: 'bg-semantic-success',
  },
  failed_partial: {
    label: labelMap.failed_partial,
    className: 'border-semantic-error-border bg-semantic-error-bg text-semantic-error',
    dotClassName: 'bg-semantic-error',
  },
  failed_terminal: {
    label: labelMap.failed_terminal,
    className: 'border-semantic-error-border bg-semantic-error-bg text-semantic-error',
    dotClassName: 'bg-semantic-error',
  },
  deleted: {
    label: labelMap.deleted,
    className: 'border-white/[0.07] bg-surface-hover text-content-secondary',
    dotClassName: 'bg-content-muted',
  },
  draft: {
    label: labelMap.draft,
    className: 'border-white/[0.07] bg-surface-hover text-content-secondary',
    dotClassName: 'bg-content-muted',
  },
  generating: {
    label: labelMap.generating,
    className: 'border-semantic-warning-border bg-semantic-warning-bg text-semantic-warning',
    dotClassName: 'bg-semantic-warning',
    pulse: true,
  },
  in_progress: {
    label: labelMap.in_progress,
    className: 'border-brand-500/20 bg-brand-500/10 text-brand-300',
    dotClassName: 'bg-brand-400',
    pulse: true,
  },
  submitted: {
    label: labelMap.submitted,
    className: 'border-brand-500/20 bg-brand-500/10 text-brand-300',
    dotClassName: 'bg-brand-400',
  },
  grading: {
    label: labelMap.grading,
    className: 'border-semantic-warning-border bg-semantic-warning-bg text-semantic-warning',
    dotClassName: 'bg-semantic-warning',
    pulse: true,
  },
  graded: {
    label: labelMap.graded,
    className: 'border-semantic-success-border bg-semantic-success-bg text-semantic-success',
    dotClassName: 'bg-semantic-success',
  },
  objection_pending: {
    label: labelMap.objection_pending,
    className: 'border-semantic-warning-border bg-semantic-warning-bg text-semantic-warning',
    dotClassName: 'bg-semantic-warning',
  },
  regraded: {
    label: labelMap.regraded,
    className: 'border-semantic-success-border bg-semantic-success-bg text-semantic-success',
    dotClassName: 'bg-semantic-success',
  },
  closed: {
    label: labelMap.closed,
    className: 'border-white/[0.07] bg-surface-hover text-content-secondary',
    dotClassName: 'bg-content-muted',
  },
  generation_failed: {
    label: labelMap.generation_failed,
    className: 'border-semantic-error-border bg-semantic-error-bg text-semantic-error',
    dotClassName: 'bg-semantic-error',
  },
  active: {
    label: labelMap.active,
    className: 'border-semantic-success-border bg-semantic-success-bg text-semantic-success',
    dotClassName: 'bg-semantic-success',
  },
  inactive: {
    label: labelMap.inactive,
    className: 'border-white/[0.07] bg-surface-hover text-content-secondary',
    dotClassName: 'bg-content-muted',
  },
  correct: {
    label: labelMap.correct,
    className: 'border-semantic-success-border bg-semantic-success-bg text-semantic-success',
    dotClassName: 'bg-semantic-success',
  },
  incorrect: {
    label: labelMap.incorrect,
    className: 'border-semantic-error-border bg-semantic-error-bg text-semantic-error',
    dotClassName: 'bg-semantic-error',
  },
  partial: {
    label: labelMap.partial,
    className: 'border-semantic-warning-border bg-semantic-warning-bg text-semantic-warning',
    dotClassName: 'bg-semantic-warning',
  },
  info: {
    label: labelMap.info,
    className: 'border-semantic-info-border bg-semantic-info-bg text-brand-300',
    dotClassName: 'bg-brand-400',
  },
  warning: {
    label: labelMap.warning,
    className: 'border-semantic-warning-border bg-semantic-warning-bg text-semantic-warning',
    dotClassName: 'bg-semantic-warning',
  },
  error: {
    label: labelMap.error,
    className: 'border-semantic-error-border bg-semantic-error-bg text-semantic-error',
    dotClassName: 'bg-semantic-error',
  },
  debug: {
    label: labelMap.debug,
    className: 'border-white/[0.07] bg-surface-hover text-content-secondary',
    dotClassName: 'bg-content-muted',
  },
  critical: {
    label: labelMap.critical,
    className: 'border-semantic-error-border bg-semantic-error-bg text-semantic-error',
    dotClassName: 'bg-semantic-error',
  },
};

function formatFallbackLabel(status: string) {
  return status
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
    .trim();
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const normalizedStatus = status.toLowerCase();
  const statusConfig = statusConfigMap[normalizedStatus] ?? {
    label: labelMap[normalizedStatus] || formatFallbackLabel(status),
    className: 'border-white/[0.07] bg-surface-hover text-content-secondary',
    dotClassName: 'bg-content-muted',
  };

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium leading-none whitespace-nowrap ${statusConfig.className}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${statusConfig.dotClassName}${statusConfig.pulse ? ' animate-pulse' : ''}`}
        aria-hidden="true"
      />
      {statusConfig.label}
    </span>
  );
}
