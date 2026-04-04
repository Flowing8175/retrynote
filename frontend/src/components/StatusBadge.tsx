interface StatusBadgeProps {
  status: string;
}

const labelMap: Record<string, string> = {
  uploaded: '업로드됨',
  parsing: '분석 중',
  parsed: '분석 완료',
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
  objection_pending: '이의제기',
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

const colorMap: Record<string, string> = {
  ready: 'text-brand-300',
  graded: 'text-brand-300',
  correct: 'text-brand-300',
  active: 'text-brand-300',
  parsed: 'text-brand-300',
  
  parsing: 'text-semantic-warning',
  generating: 'text-semantic-warning',
  in_progress: 'text-semantic-warning',
  grading: 'text-semantic-warning',
  partial: 'text-semantic-warning',
  warning: 'text-semantic-warning',
  
  failed_terminal: 'text-destructive',
  generation_failed: 'text-destructive',
  incorrect: 'text-destructive',
  error: 'text-destructive',
  critical: 'text-destructive',
  
  deleted: 'text-content-muted',
  closed: 'text-content-muted',
  inactive: 'text-content-muted',
};

function formatFallbackLabel(status: string) {
  return status.replace(/[_-]+/g, ' ').toUpperCase();
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const normalizedStatus = status.toLowerCase();
  const label = labelMap[normalizedStatus] || formatFallbackLabel(status);
  const colorClass = colorMap[normalizedStatus] || 'text-content-secondary';

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${colorClass}`}>
      <span className="relative flex h-1.5 w-1.5">
        {(normalizedStatus.includes('processing') || normalizedStatus.includes('ing') || normalizedStatus === 'in_progress') && (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-40" />
        )}
        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-current opacity-80" />
      </span>
      {label}
    </span>
  );
}
