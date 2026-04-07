import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/api';
import type { AdminFileStatusBreakdown, AdminFileInProgress, AdminFileFailure } from '@/types';
import { formatRelative, formatDateTime } from './adminUtils';

interface AdminFilesTabProps {
  isVerified: boolean;
  activeTab: string;
}

function getStatusColorCls(status: string): { card: string; badge: string; dot: string } {
  if (status === 'ready') {
    return {
      card: 'border-green-500/20 bg-green-500/5',
      badge: 'bg-green-500/15 text-green-400 border border-green-500/20',
      dot: 'bg-green-400',
    };
  }
  if (status.startsWith('failed')) {
    return {
      card: 'border-red-500/20 bg-red-500/5',
      badge: 'bg-red-500/15 text-red-400 border border-red-500/20',
      dot: 'bg-red-400',
    };
  }
  if (status.includes('processing') || status.includes('parsing') || status === 'uploaded') {
    return {
      card: 'border-amber-500/20 bg-amber-500/5',
      badge: 'bg-amber-500/15 text-amber-400 border border-amber-500/20',
      dot: 'bg-amber-400',
    };
  }
  return {
    card: 'border-white/[0.07] bg-surface-raised',
    badge: 'bg-white/5 text-content-muted border border-white/[0.07]',
    dot: 'bg-white/30',
  };
}

function truncate(str: string, max: number): string {
  return str.length > max ? `${str.slice(0, max)}…` : str;
}

export default function AdminFilesTab({ isVerified, activeTab }: AdminFilesTabProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-files-pipeline'],
    queryFn: adminApi.getFilePipeline,
    enabled: isVerified && activeTab === 'files',
    refetchInterval: 15_000,
  });

  const statusBreakdown: AdminFileStatusBreakdown[] = data?.status_breakdown ?? [];
  const inProgress: AdminFileInProgress[] = data?.in_progress ?? [];
  const recentFailures: AdminFileFailure[] = data?.recent_failures ?? [];

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between rounded-2xl border border-white/[0.07] bg-surface-raised px-4 py-3">
        <span className="text-xs font-medium text-content-muted">파일 파이프라인 현황</span>
        <div className="flex items-center gap-2">
          {isLoading && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-400" />}
          <span className="font-mono text-xs text-content-muted">15초 자동 갱신</span>
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-content-muted">
          상태별 현황
        </h3>
        {statusBreakdown.length === 0 && !isLoading && (
          <p className="text-sm text-content-muted">데이터가 없습니다.</p>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {statusBreakdown.map((item: AdminFileStatusBreakdown) => {
            const colors = getStatusColorCls(item.status);
            return (
              <div
                key={item.status}
                className={`rounded-2xl border p-4 ${colors.card}`}
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className={`inline-flex h-2 w-2 flex-shrink-0 rounded-full ${colors.dot}`} />
                  <span className="truncate font-mono text-xs text-content-muted" title={item.status}>
                    {item.status}
                  </span>
                </div>
                <p className="font-mono text-2xl font-semibold text-content-primary">{item.count}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-content-muted">
          처리 중 파일
        </h3>
        <div className="overflow-x-auto overflow-hidden rounded-3xl border border-white/[0.07] bg-surface">
          <table className="min-w-full divide-y divide-white/[0.07]">
            <thead className="bg-surface-raised">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">
                  파일명
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">
                  상태
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">
                  사용자
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">
                  경과
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.07] bg-surface">
              {isLoading && inProgress.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-sm text-content-muted">
                    불러오는 중…
                  </td>
                </tr>
              )}
              {!isLoading && inProgress.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-sm text-content-muted">
                    처리 중인 파일이 없습니다.
                  </td>
                </tr>
              )}
              {inProgress.map((file: AdminFileInProgress) => {
                const colors = getStatusColorCls(file.status);
                return (
                  <tr key={file.id} className="transition-colors hover:bg-surface-deep/50">
                    <td
                      className="px-6 py-4 text-sm text-content-primary"
                      title={file.original_filename}
                    >
                      {truncate(file.original_filename, 40)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 font-mono text-xs font-medium ${colors.badge}`}
                      >
                        {file.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap font-mono text-xs text-content-secondary">
                      {file.username}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap font-mono text-xs text-content-secondary">
                      {file.processing_started_at
                        ? formatRelative(file.processing_started_at)
                        : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-content-muted">
          최근 실패
        </h3>
        <div className="overflow-x-auto overflow-hidden rounded-3xl border border-white/[0.07] bg-surface">
          <table className="min-w-full divide-y divide-white/[0.07]">
            <thead className="bg-surface-raised">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">
                  파일명
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">
                  오류 코드
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">
                  사용자
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">
                  실패 시각
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.07] bg-surface">
              {isLoading && recentFailures.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-sm text-content-muted">
                    불러오는 중…
                  </td>
                </tr>
              )}
              {!isLoading && recentFailures.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-sm text-content-muted">
                    최근 실패 파일이 없습니다.
                  </td>
                </tr>
              )}
              {recentFailures.map((file: AdminFileFailure) => (
                <tr key={file.id} className="transition-colors hover:bg-surface-deep/50">
                  <td
                    className="px-6 py-4 text-sm text-content-primary"
                    title={file.original_filename}
                  >
                    {truncate(file.original_filename, 40)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {file.parse_error_code ? (
                      <span className="font-mono text-xs text-red-400">
                        {file.parse_error_code}
                      </span>
                    ) : (
                      <span className="text-content-muted">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap font-mono text-xs text-content-secondary">
                    {file.username}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap font-mono text-xs text-content-secondary">
                    {file.processing_finished_at
                      ? formatDateTime(file.processing_finished_at)
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
