import type { AdminLogResponse } from '@/types';
import { formatDateTime, LogLevelBadge, LOG_LEVELS } from './adminUtils';

interface AdminLogsTabProps {
  logsData: AdminLogResponse | undefined;
  logLevelFilter: string | null;
  setLogLevelFilter: (filter: string | null) => void;
}

export default function AdminLogsTab({ logsData, logLevelFilter, setLogLevelFilter }: AdminLogsTabProps) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 rounded-2xl border border-white/[0.07] bg-surface-raised px-4 py-3">
        <span className="text-xs font-medium text-content-muted">레벨 필터:</span>
        <div className="flex items-center gap-1.5">
          {LOG_LEVELS.map((lvl) => {
            const filterValue = lvl === '전체' ? null : lvl;
            const isActive = logLevelFilter === filterValue;
            return (
              <button
                key={lvl}
                onClick={() => setLogLevelFilter(filterValue)}
                className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-500/20 text-brand-300 ring-1 ring-brand-500/40'
                    : 'text-content-secondary hover:bg-white/[0.05] hover:text-content-primary'
                }`}
              >
                {lvl}
              </button>
            );
          })}
        </div>
        {logsData && (
          <span className="ml-auto font-mono text-xs text-content-muted">{logsData.logs.length}건</span>
        )}
      </div>

      <div className="overflow-hidden rounded-3xl border border-white/[0.07] bg-surface">
        <table className="min-w-full divide-y divide-white/[0.07]">
          <thead className="bg-surface-raised">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">시간</th>
              <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">레벨</th>
              <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">서비스</th>
              <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">이벤트</th>
              <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">메시지</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.07] bg-surface">
            {logsData?.logs.slice(0, 50).map((log) => (
              <tr key={log.id} className="align-top transition-colors hover:bg-surface-deep/50">
                <td className="px-6 py-4 whitespace-nowrap font-mono text-xs text-content-secondary">
                  {formatDateTime(log.created_at)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <LogLevelBadge level={log.level} />
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-content-primary">
                  {log.service_name}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-content-primary">
                  {log.event_type}
                </td>
                <td className="max-w-md px-6 py-4">
                  <span className="font-mono text-xs leading-5 text-content-secondary">{log.message}</span>
                  {log.trace_id && (
                    <div className="mt-1 font-mono text-[10px] text-content-muted opacity-60">
                      trace: {log.trace_id}
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {(!logsData || logsData.logs.length === 0) && (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-sm text-content-muted">
                  로그가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
