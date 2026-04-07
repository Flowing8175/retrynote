import { StatusBadge } from '@/components';
import type { AdminUserListResponse } from '@/types';
import { formatDateTime, formatRelative } from './adminUtils';

interface AdminUsersTabProps {
  usersData: AdminUserListResponse | undefined;
}

export default function AdminUsersTab({ usersData }: AdminUsersTabProps) {
  return (
    <section className="overflow-hidden rounded-3xl border border-white/[0.07] bg-surface">
      <table className="min-w-full divide-y divide-white/[0.07]">
        <thead className="bg-surface-raised">
          <tr>
            <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">사용자</th>
            <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">이메일</th>
            <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">가입일</th>
            <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">마지막 접속</th>
            <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">저장공간</th>
            <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">상태</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.07] bg-surface">
          {usersData?.users.map((user) => {
            const storageMB = user.storage_used_bytes / 1024 / 1024;
            const storagePct = Math.min((storageMB / 500) * 100, 100);
            const storageColor = storagePct >= 90 ? 'bg-red-500' : storagePct >= 70 ? 'bg-amber-500' : 'bg-brand-500';
            return (
              <tr key={user.id} className="align-top transition-colors hover:bg-surface-deep/50">
                <td className="px-6 py-5 whitespace-nowrap text-sm font-medium text-content-primary">
                  {user.username}
                </td>
                <td className="px-6 py-5 whitespace-nowrap text-sm text-content-primary">
                  {user.email}
                </td>
                <td className="px-6 py-5 whitespace-nowrap text-sm text-content-secondary">
                  {formatDateTime(user.created_at)}
                </td>
                <td className="px-6 py-5 whitespace-nowrap text-sm text-content-secondary">
                  {formatRelative(user.last_login_at)}
                </td>
                <td className="px-6 py-5 whitespace-nowrap text-sm">
                  <div className="min-w-[6rem]">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-mono text-xs text-content-secondary">{storageMB.toFixed(1)} MB</span>
                      <span className="font-mono text-[10px] text-content-muted">/ 500</span>
                    </div>
                    <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/[0.07]">
                      <div
                        className={`h-full rounded-full transition-all ${storageColor}`}
                        style={{ width: `${storagePct}%` }}
                      />
                    </div>
                  </div>
                </td>
                <td className="px-6 py-5 whitespace-nowrap text-sm">
                  <StatusBadge status={user.is_active ? 'active' : 'inactive'} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
