import { useState, useEffect, Fragment } from 'react';
import { adminApi } from '@/api';
import type { AdminLogItem, AdminLogResponse } from '@/types';
import { formatDateTime, LogLevelBadge, LOG_LEVELS } from './adminUtils';

interface AdminLogsTabProps {
  logsData: AdminLogResponse | undefined;
  logLevelFilter: string | null;
  setLogLevelFilter: (filter: string | null) => void;
}

export default function AdminLogsTab({ logsData, logLevelFilter, setLogLevelFilter }: AdminLogsTabProps) {
  const [localLogs, setLocalLogs] = useState<AdminLogItem[]>(logsData?.logs ?? []);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [isTailMode, setIsTailMode] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const blob = await adminApi.exportLogs(logLevelFilter || undefined);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `admin_logs_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

  useEffect(() => {
    if (logsData) {
      setLocalLogs(logsData.logs);
    }
  }, [logsData]);

  useEffect(() => {
    if (!isTailMode) return;
    const id = setInterval(async () => {
      try {
        const fresh = await adminApi.listLogs(1, 50, logLevelFilter);
        setLocalLogs((prev) => {
          const topCreatedAt = prev[0]?.created_at;
          const newLogs = topCreatedAt
            ? fresh.logs.filter((l) => l.created_at > topCreatedAt)
            : fresh.logs;
          return newLogs.length > 0 ? [...newLogs, ...prev] : prev;
        });
      } catch {
        void 0;
      }
    }, 5000);
    return () => clearInterval(id);
  }, [isTailMode, logLevelFilter]);

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/[0.07] bg-surface-raised px-4 py-3">
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

        <label className="ml-3 flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={isTailMode}
            onChange={(e) => setIsTailMode(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-white/20 bg-surface accent-brand-500"
          />
          <span className={`text-xs font-medium ${isTailMode ? 'text-brand-300' : 'text-content-muted'}`}>
            실시간 테일 모드
          </span>
          {isTailMode && (
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-400" />
          )}
        </label>

        <button
          onClick={handleExport}
          disabled={isExporting}
          className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-white/[0.07] bg-surface px-3 py-1.5 text-xs font-medium text-content-secondary transition-colors hover:bg-surface-hover disabled:opacity-50"
        >
          {isExporting ? (
            <svg className="h-3.5 w-3.5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
          )}
          CSV 내보내기
        </button>
        <span className="font-mono text-xs text-content-muted">{localLogs.length}건</span>
      </div>

      <div className="overflow-hidden rounded-3xl border border-white/[0.07] bg-surface">
        <table className="min-w-full divide-y divide-white/[0.07]">
          <thead className="bg-surface-raised">
            <tr>
              <th className="w-8 px-3 py-4" />
              <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">시간</th>
              <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">레벨</th>
              <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">서비스</th>
              <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">이벤트</th>
              <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">메시지</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.07] bg-surface">
            {localLogs.slice(0, 50).map((log) => {
              const isExpanded = expandedRows.has(log.id);
              return (
                <Fragment key={log.id}>
                  <tr className="align-top transition-colors hover:bg-surface-deep/50">
                    <td className="px-3 py-4">
                      <button
                        onClick={() => toggleRow(log.id)}
                        className="flex h-5 w-5 items-center justify-center rounded text-content-muted transition-colors hover:bg-white/[0.08] hover:text-content-primary"
                        aria-label={isExpanded ? '접기' : '펼치기'}
                        aria-expanded={isExpanded}
                      >
                        <svg
                          className={`h-3 w-3 transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2.5}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </td>
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

                  {isExpanded && (
                    <tr className="bg-surface-deep/20">
                      <td colSpan={6} className="px-6 py-4">
                        <div className="space-y-3">
                          <div>
                            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-content-muted">
                              전체 메시지
                            </p>
                            <p className="whitespace-pre-wrap break-all font-mono text-xs leading-relaxed text-content-secondary">
                              {log.message}
                            </p>
                          </div>
                          <div>
                            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-content-muted">
                              메타 데이터
                            </p>
                            {log.meta_json ? (
                              <pre className="overflow-x-auto rounded-xl bg-surface-deep px-4 py-3 font-mono text-xs leading-relaxed text-content-secondary">
                                {JSON.stringify(log.meta_json, null, 2)}
                              </pre>
                            ) : (
                              <span className="text-xs italic text-content-muted">No details</span>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}

            {localLogs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-sm text-content-muted">
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
