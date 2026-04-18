import { CheckCircle2, FileText, Loader2, RotateCw, Trash2, X, AlertTriangle, Clock } from 'lucide-react';
import type { UploadItem, UploadItemStatus } from '@/hooks/useMultiFileUpload';

interface UploadQueueProps {
  items: UploadItem[];
  activeCount: number;
  completedCount: number;
  failedCount: number;
  totalCount: number;
  onCancelItem: (id: string) => void;
  onRetryItem: (id: string) => void;
  onRemoveItem: (id: string) => void;
  onClearFinished: () => void;
  onCancelAll: () => void;
}

function formatSize(bytes: number): string {
  const mb = 1024 * 1024;
  if (bytes >= mb) return `${(bytes / mb).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function statusLabel(status: UploadItemStatus): string {
  switch (status) {
    case 'queued':
      return '대기 중';
    case 'uploading':
      return '업로드 중';
    case 'processing':
      return '서버 처리 중';
    case 'done':
      return '완료';
    case 'failed':
      return '실패';
    case 'canceled':
      return '취소됨';
  }
}

function statusColor(status: UploadItemStatus): string {
  switch (status) {
    case 'done':
      return 'text-brand-300';
    case 'failed':
      return 'text-semantic-error';
    case 'canceled':
      return 'text-content-muted';
    case 'uploading':
    case 'processing':
      return 'text-semantic-warning';
    case 'queued':
    default:
      return 'text-content-secondary';
  }
}

function StatusIcon({ status }: { status: UploadItemStatus }) {
  const iconSize = 16;
  switch (status) {
    case 'done':
      return <CheckCircle2 size={iconSize} className="text-brand-300 shrink-0" />;
    case 'failed':
      return <AlertTriangle size={iconSize} className="text-semantic-error shrink-0" />;
    case 'canceled':
      return <X size={iconSize} className="text-content-muted shrink-0" />;
    case 'uploading':
    case 'processing':
      return <Loader2 size={iconSize} className="text-semantic-warning shrink-0 animate-spin" />;
    case 'queued':
    default:
      return <Clock size={iconSize} className="text-content-muted shrink-0" />;
  }
}

export default function UploadQueue({
  items,
  activeCount,
  completedCount,
  failedCount,
  totalCount,
  onCancelItem,
  onRetryItem,
  onRemoveItem,
  onClearFinished,
  onCancelAll,
}: UploadQueueProps) {
  if (items.length === 0) return null;

  const hasFinished = completedCount > 0 || failedCount > 0;

  return (
    <section
      aria-label="업로드 대기열"
      className="bg-surface border border-white/[0.05] rounded-3xl p-5 space-y-4 animate-fade-in-up"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.05] pb-3">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-white">업로드 대기열</h3>
          <span className="text-xs text-content-muted">
            완료 {completedCount} / 실패 {failedCount} / 전체 {totalCount}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {activeCount > 0 && (
            <button
              onClick={onCancelAll}
              className="text-xs font-medium text-semantic-error hover:text-semantic-error/80 px-3 py-1.5 rounded-lg bg-semantic-error/10 border border-semantic-error/20 transition-colors"
            >
              모두 취소
            </button>
          )}
          {hasFinished && (
            <button
              onClick={onClearFinished}
              className="text-xs font-medium text-content-secondary hover:text-white px-3 py-1.5 rounded-lg bg-surface-deep border border-white/[0.05] transition-colors"
            >
              완료 항목 정리
            </button>
          )}
        </div>
      </header>

      <ul className="space-y-2 max-h-80 overflow-y-auto pr-1">
        {items.map((item) => {
          const isActive = item.status === 'uploading' || item.status === 'processing';
          const isRetryable = item.status === 'failed' || item.status === 'canceled';
          const isQueued = item.status === 'queued';
          const canCancel = isActive || isQueued;

          return (
            <li
              key={item.id}
              className="bg-surface-deep border border-white/[0.05] rounded-2xl p-3.5 space-y-2"
            >
              <div className="flex items-start gap-3">
                <FileText size={18} className="text-content-muted shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-medium text-white truncate" title={item.file.name}>
                      {item.file.name}
                    </p>
                    <span className="text-xs text-content-muted shrink-0">
                      {formatSize(item.file.size)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <StatusIcon status={item.status} />
                    <span className={`text-xs font-medium ${statusColor(item.status)}`}>
                      {statusLabel(item.status)}
                      {item.status === 'uploading' && ` · ${item.progress}%`}
                    </span>
                  </div>
                  {item.errorMessage && (
                    <p className="text-xs text-semantic-error mt-1 break-words">
                      {item.errorMessage}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {isRetryable && (
                    <button
                      onClick={() => onRetryItem(item.id)}
                      className="p-1.5 rounded-lg text-brand-300 hover:bg-brand-500/10 transition-colors"
                      title="다시 시도"
                      aria-label={`${item.file.name} 다시 시도`}
                    >
                      <RotateCw size={14} />
                    </button>
                  )}
                  {canCancel && (
                    <button
                      onClick={() => onCancelItem(item.id)}
                      className="p-1.5 rounded-lg text-content-muted hover:text-semantic-error hover:bg-semantic-error/10 transition-colors"
                      title="취소"
                      aria-label={`${item.file.name} 취소`}
                    >
                      <X size={14} />
                    </button>
                  )}
                  {!canCancel && (
                    <button
                      onClick={() => onRemoveItem(item.id)}
                      className="p-1.5 rounded-lg text-content-muted hover:text-semantic-error hover:bg-semantic-error/10 transition-colors"
                      title="목록에서 제거"
                      aria-label={`${item.file.name} 목록에서 제거`}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>

              {isActive && (
                <div
                  className="h-1.5 w-full bg-white/[0.05] rounded-full overflow-hidden"
                  role="progressbar"
                  aria-valuenow={item.progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${item.file.name} 업로드 진행률`}
                >
                  <div
                    className={`h-full transition-all duration-300 ease-out ${
                      item.status === 'processing'
                        ? 'bg-semantic-warning animate-pulse'
                        : 'bg-brand-500'
                    }`}
                    style={{ width: `${item.status === 'processing' ? 100 : item.progress}%` }}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
