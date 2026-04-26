import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}

function formatRemaining(ms: number): string {
  const totalHours = Math.floor(ms / (1000 * 60 * 60));
  if (totalHours < 1) return '1시간 미만';
  if (totalHours < 24) return `약 ${totalHours}시간`;
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (hours === 0) return `${days}일`;
  return `${days}일 ${hours}시간`;
}

export default function StorageWarningBanner() {
  const [dismissed, setDismissed] = useState(false);
  const user = useAuthStore((s) => s.user);

  if (dismissed || !user?.storage_deletion_deadline) return null;

  const deadline = new Date(user.storage_deletion_deadline);
  const now = new Date();
  const remaining = deadline.getTime() - now.getTime();
  const overBy = user.storage_used_bytes - user.storage_quota_bytes;
  const expired = remaining <= 0;

  if (overBy <= 0) return null;

  const message = expired
    ? `현재 ${formatBytes(overBy)} 초과 중이며 삭제 기한이 지났습니다. 오래된 파일부터 자동 삭제가 진행됩니다. 파일을 직접 정리하거나 플랜을 업그레이드하세요.`
    : `현재 ${formatBytes(overBy)} 초과 중입니다. ${formatRemaining(remaining)} 후 오래된 파일부터 자동 삭제됩니다. 파일을 정리하거나 플랜을 업그레이드하세요.`;

  return (
    <div className={`flex items-start gap-3 border-b px-4 py-2.5 sm:px-6 ${
      expired
        ? 'bg-semantic-error-bg border-semantic-error-border'
        : 'bg-semantic-warning-bg border-semantic-warning-border'
    }`}>
      <AlertTriangle size={15} className={`mt-0.5 shrink-0 ${expired ? 'text-semantic-error' : 'text-semantic-warning'}`} />
      <div className="min-w-0 flex-1">
        <span className={`text-sm font-medium ${expired ? 'text-semantic-error' : 'text-semantic-warning'}`}>
          {expired ? '파일 자동 삭제 진행 중' : '저장 용량 초과'}
        </span>
        <span className="ml-2 text-sm text-content-secondary">{message}</span>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="ml-2 shrink-0 text-content-muted transition-colors hover:text-content-primary"
        aria-label="닫기"
      >
        <X size={14} />
      </button>
    </div>
  );
}
