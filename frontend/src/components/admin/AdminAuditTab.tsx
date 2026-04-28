import { useState, Fragment } from 'react';
import { adminApi } from '@/api';
import type { AdminAuditLogItem, AdminAuditLogFilters } from '@/types';
import { formatDateTime } from './adminUtils';

const ACTION_TYPES = [
  'admin_login_success',
  'admin_login_failed',
  'admin_login_denied',
  'admin_master_password_initialized',
  'list_users',
  'update_user_status',
  'update_user_role',
  'delete_user',
  'list_logs',
  'view_model_usage',
  'view_audit_logs',
  'view_db_diagnostics',
  'impersonation_start',
  'impersonation_end',
  'regrade_request',
  'update_model_settings',
  'create_announcement',
  'delete_announcement',
  'job_retry',
  'job_cancel',
  'export_users',
  'export_logs',
  'export_audit_logs',
] as const;

interface AdminAuditTabProps {
  auditData: { logs: AdminAuditLogItem[]; total: number } | undefined;
  auditPage: number;
  setAuditPage: React.Dispatch<React.SetStateAction<number>>;
  auditTotalPages: number;
  auditFilters: AdminAuditLogFilters;
  setAuditFilters: React.Dispatch<React.SetStateAction<AdminAuditLogFilters>>;
}

function SuccessBadge({ success }: { success: boolean }) {
  if (success) {
    return (
      <span className="inline-flex items-center rounded-md px-2 py-0.5 font-mono text-xs font-semibold bg-semantic-success-bg text-semantic-success border border-semantic-success-border">
        ✓
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-md px-2 py-0.5 font-mono text-xs font-semibold bg-semantic-error-bg text-semantic-error border border-semantic-error-border">
      ✗
    </span>
  );
}

function AdminCell({ log }: { log: AdminAuditLogItem }) {
  if (!log.admin_email && !log.admin_user_id) {
    return <span className="text-sm text-content-muted">—</span>;
  }
  const primary = log.admin_email ?? `${log.admin_user_id!.slice(0, 8)}…`;
  return (
    <div className="space-y-0.5">
      <div className="text-xs font-medium text-content-primary">{primary}</div>
      {log.admin_role && (
        <div className="text-[10px] text-content-muted">{log.admin_role}</div>
      )}
      {log.admin_email && log.admin_user_id && (
        <div className="font-mono text-[10px] text-content-muted">{log.admin_user_id.slice(0, 8)}…</div>
      )}
    </div>
  );
}

const inputCls =
  'w-full rounded-xl border border-white/[0.10] bg-surface px-3 py-1.5 text-xs text-content-primary placeholder:text-content-muted focus:border-brand-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500/30 transition-colors';

export default function AdminAuditTab({
  auditData,
  auditPage,
  setAuditPage,
  auditTotalPages,
  auditFilters,
  setAuditFilters,
}: AdminAuditTabProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const [dateFromLocal, setDateFromLocal] = useState('');
  const [dateToLocal, setDateToLocal] = useState('');

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

  const handleReset = () => {
    setDateFromLocal('');
    setDateToLocal('');
    setAuditFilters({
      action_type: null,
      admin_user_id: null,
      target_user_id: null,
      date_from: null,
      date_to: null,
    });
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const blob = await adminApi.exportAuditLogs();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `admin_audit_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

  const hasActiveFilters =
    auditFilters.action_type ||
    auditFilters.admin_user_id ||
    auditFilters.target_user_id ||
    auditFilters.date_from ||
    auditFilters.date_to;

  return (
    <div className="space-y-3">
      <section className="rounded-2xl border border-white/[0.07] bg-surface-raised px-4 py-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-medium text-content-muted">필터</span>
          {hasActiveFilters && (
            <button
              onClick={handleReset}
              className="text-[11px] font-medium text-brand-300 transition-colors hover:text-brand-200"
            >
              필터 초기화
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <select
            value={auditFilters.action_type ?? ''}
            onChange={(e) =>
              setAuditFilters((prev) => ({
                ...prev,
                action_type: e.target.value || null,
              }))
            }
            className={inputCls}
          >
            <option value="">액션 전체</option>
            {ACTION_TYPES.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>

          <input
            type="text"
            placeholder="관리자 ID"
            value={auditFilters.admin_user_id ?? ''}
            onChange={(e) =>
              setAuditFilters((prev) => ({
                ...prev,
                admin_user_id: e.target.value || null,
              }))
            }
            className={inputCls}
          />

          <input
            type="text"
            placeholder="대상 유저 ID"
            value={auditFilters.target_user_id ?? ''}
            onChange={(e) =>
              setAuditFilters((prev) => ({
                ...prev,
                target_user_id: e.target.value || null,
              }))
            }
            className={inputCls}
          />

          <input
            type="datetime-local"
            value={dateFromLocal}
            onChange={(e) => {
              setDateFromLocal(e.target.value);
              setAuditFilters((prev) => ({
                ...prev,
                date_from: e.target.value ? new Date(e.target.value).toISOString() : null,
              }));
            }}
            className={inputCls}
            title="시작 시간"
          />

          <input
            type="datetime-local"
            value={dateToLocal}
            onChange={(e) => {
              setDateToLocal(e.target.value);
              setAuditFilters((prev) => ({
                ...prev,
                date_to: e.target.value ? new Date(e.target.value).toISOString() : null,
              }));
            }}
            className={inputCls}
            title="종료 시간"
          />
        </div>
        {!hasActiveFilters && (
          <button
            onClick={handleReset}
            className="mt-2 text-[11px] font-medium text-content-muted transition-colors hover:text-content-secondary"
          >
            필터 초기화
          </button>
        )}
      </section>

      <div className="flex items-center justify-end">
        <button
          onClick={handleExport}
          disabled={isExporting}
          className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.07] bg-surface-raised px-4 py-2 text-xs font-medium text-content-secondary transition-colors hover:bg-surface-hover disabled:opacity-50"
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
      </div>

      <section className="overflow-hidden rounded-3xl border border-white/[0.07] bg-surface">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-white/[0.07]">
            <thead className="bg-surface-raised">
              <tr>
                <th className="w-8 px-3 py-4" />
                <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">시간</th>
                <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">성공</th>
                <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">관리자</th>
                <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">대상 유저</th>
                <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">액션</th>
                <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">대상 타입</th>
                <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">IP</th>
                <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">메서드+경로</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.07] bg-surface">
              {auditData?.logs.map((log) => {
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
                        <SuccessBadge success={log.success} />
                      </td>
                      <td className="px-6 py-4">
                        <AdminCell log={log} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {log.target_user_id ? (
                          <span className="font-mono text-xs text-content-primary">{log.target_user_id.slice(0, 8)}…</span>
                        ) : (
                          <span className="text-sm text-content-muted">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-content-primary">
                        {log.action_type}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-content-secondary">
                        {log.target_type ?? '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="font-mono text-xs text-content-secondary">{log.ip_address ?? '—'}</span>
                      </td>
                      <td className="px-6 py-4">
                        {log.request_method && log.request_path ? (
                          <span
                            className="block max-w-[16rem] truncate font-mono text-xs text-content-secondary"
                            title={`${log.request_method} ${log.request_path}`}
                          >
                            {log.request_method} {log.request_path}
                          </span>
                        ) : (
                          <span className="text-sm text-content-muted">—</span>
                        )}
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr className="bg-surface-deep/20">
                        <td colSpan={9} className="px-6 py-4">
                          <div className="space-y-3">
                            {log.request_id && (
                              <div>
                                <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-content-muted">
                                  Request ID
                                </p>
                                <span className="font-mono text-xs text-content-secondary">{log.request_id}</span>
                              </div>
                            )}
                            {log.user_agent && (
                              <div>
                                <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-content-muted">
                                  User Agent
                                </p>
                                <span
                                  className="block break-all font-mono text-xs leading-relaxed text-content-secondary"
                                  title={log.user_agent}
                                >
                                  {log.user_agent}
                                </span>
                              </div>
                            )}
                            {!log.request_id && !log.user_agent && (
                              <span className="text-xs italic text-content-muted">상세 정보 없음</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {auditData?.logs.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-sm text-content-muted">
                    감사 로그가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-white/[0.07] px-6 py-4">
          <button
            onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
            disabled={auditPage <= 1}
            className="rounded-xl border border-white/[0.07] bg-surface-deep px-4 py-2 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-hover disabled:opacity-40"
          >
            이전
          </button>
          <span className="font-mono text-xs text-content-secondary">
            {auditPage} / {auditTotalPages} 페이지
          </span>
          <button
            onClick={() => setAuditPage((p) => Math.min(auditTotalPages, p + 1))}
            disabled={auditPage >= auditTotalPages}
            className="rounded-xl border border-white/[0.07] bg-surface-deep px-4 py-2 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-hover disabled:opacity-40"
          >
            다음
          </button>
        </div>
      </section>
    </div>
  );
}
