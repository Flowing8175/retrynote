import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/api';
import type { AdminRateLimitEvent } from '@/types';
import { formatDateTime } from './adminUtils';

interface AdminRateLimitTabProps {
  isVerified: boolean;
  activeTab: string;
}

export default function AdminRateLimitTab({ isVerified, activeTab }: AdminRateLimitTabProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-rate-limits'],
    queryFn: adminApi.getRateLimits,
    enabled: isVerified && activeTab === 'rate-limits',
    refetchInterval: 60_000,
  });

  const events: AdminRateLimitEvent[] = data?.events ?? [];
  const totalEvents = data?.total_events_24h ?? 0;
  const uniqueIps = data?.unique_ips_count ?? 0;
  const topPaths = (data?.top_paths ?? []).slice(0, 5);

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between rounded-2xl border border-white/[0.07] bg-surface-raised px-4 py-3">
        <span className="text-xs font-medium text-content-muted">요청 제한 현황 (최근 24시간)</span>
        <div className="flex items-center gap-2">
          {isLoading && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-400" />}
          <span className="font-mono text-xs text-content-muted">60초 자동 갱신</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/[0.07] bg-surface-raised p-5">
          <p className="mb-1 text-xs font-medium uppercase tracking-[0.18em] text-content-muted">
            총 이벤트
          </p>
          <p className="font-mono text-3xl font-semibold text-content-primary">
            {totalEvents.toLocaleString()}
          </p>
        </div>
        <div className="rounded-2xl border border-white/[0.07] bg-surface-raised p-5">
          <p className="mb-1 text-xs font-medium uppercase tracking-[0.18em] text-content-muted">
            고유 IP
          </p>
          <p className="font-mono text-3xl font-semibold text-content-primary">
            {uniqueIps.toLocaleString()}
          </p>
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-content-muted">
          상위 경로 (Top 5)
        </h3>
        {topPaths.length === 0 && !isLoading && (
          <p className="text-sm text-content-muted">데이터가 없습니다.</p>
        )}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {topPaths.map(({ path, count }) => (
            <div
              key={path}
              className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-surface-raised px-4 py-3"
            >
              <span
                className="min-w-0 flex-1 truncate font-mono text-xs text-content-secondary"
                title={path}
              >
                {path}
              </span>
               {count > 50 ? (
                 <span className="inline-flex shrink-0 items-center rounded-md border border-semantic-error-border bg-semantic-error-bg px-2 py-0.5 font-mono text-xs font-semibold text-semantic-error">
                   {count}
                 </span>
               ) : (
                 <span className="inline-flex shrink-0 items-center rounded-md border border-white/[0.07] bg-white/5 px-2 py-0.5 font-mono text-xs font-medium text-content-muted">
                   {count}
                 </span>
               )}
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-content-muted">
          이벤트 내역
        </h3>
        <div className="overflow-x-auto overflow-hidden rounded-3xl border border-white/[0.07] bg-surface">
          <table className="min-w-full divide-y divide-white/[0.07]">
            <thead className="bg-surface-raised">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">
                  클라이언트 IP
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">
                  경로
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">
                  횟수
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">
                  최근 발생
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.07] bg-surface">
              {isLoading && events.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-sm text-content-muted">
                    불러오는 중…
                  </td>
                </tr>
              )}
              {!isLoading && events.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-sm text-content-muted">
                    이벤트 데이터가 없습니다.
                  </td>
                </tr>
              )}
              {events.map((event: AdminRateLimitEvent, idx: number) => (
                <tr key={idx} className="transition-colors hover:bg-surface-deep/50">
                  <td className="px-6 py-4 whitespace-nowrap font-mono text-xs text-content-secondary">
                    {event.client_ip ?? '—'}
                  </td>
                  <td
                    className="max-w-[240px] truncate px-6 py-4 font-mono text-xs text-content-secondary"
                    title={event.path ?? undefined}
                  >
                    {event.path ?? '—'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                     {event.event_count > 50 ? (
                       <span className="inline-flex items-center rounded-md border border-semantic-error-border bg-semantic-error-bg px-2 py-0.5 font-mono text-xs font-semibold text-semantic-error">
                         {event.event_count}
                       </span>
                     ) : (
                       <span className="font-mono text-xs text-content-secondary">
                         {event.event_count}
                       </span>
                     )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap font-mono text-xs text-content-muted">
                    {formatDateTime(event.latest_event)}
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
