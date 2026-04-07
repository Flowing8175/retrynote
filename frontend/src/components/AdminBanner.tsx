import { TriangleAlert } from 'lucide-react';
import { useAuthStore } from '@/stores';
import { adminApi } from '@/api';

export default function AdminBanner() {
  const { impersonatingUsername, impersonationId, endImpersonation } = useAuthStore();

  if (!impersonatingUsername) return null;

  const handleEnd = async () => {
    if (impersonationId) {
      try {
        await adminApi.endImpersonation(impersonationId);
      } catch {
        // Best-effort: clear local state even if server call fails
      }
    }
    endImpersonation();
  };

  return (
    <div className="border-b border-semantic-warning-border/20 bg-semantic-warning-bg px-4 py-2.5">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 text-sm">
          <TriangleAlert className="h-4 w-4 shrink-0 text-semantic-warning" />
          <span className="font-medium text-content-primary">관리자 가장 모드</span>
          <span className="text-content-secondary">—</span>
          <span className="text-content-secondary">
            <span className="font-medium text-content-primary">{impersonatingUsername}</span> 계정으로 보는 중
          </span>
        </div>
        <button
          type="button"
          onClick={handleEnd}
          className="shrink-0 rounded-lg border border-semantic-warning-border/30 px-3 py-1.5 text-xs font-medium text-content-secondary transition-colors hover:bg-surface-hover hover:text-content-primary"
        >
          종료
        </button>
      </div>
    </div>
  );
}
