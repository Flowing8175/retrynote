import { useState } from 'react';
import { adminApi } from '@/api';
import type { AdminAuditLogItem } from '@/types';
import { formatDateTime } from './adminUtils';

interface AdminAuditTabProps {
  auditData: { logs: AdminAuditLogItem[]; total: number } | undefined;
  auditPage: number;
  setAuditPage: React.Dispatch<React.SetStateAction<number>>;
  auditTotalPages: number;
}

export default function AdminAuditTab({ auditData, auditPage, setAuditPage, auditTotalPages }: AdminAuditTabProps) {
  const [isExporting, setIsExporting] = useState(false);

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

  return (
    <div className="space-y-3">
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
      <table className="min-w-full divide-y divide-white/[0.07]">
        <thead className="bg-surface-raised">
          <tr>
            <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">시간</th>
            <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">관리자 ID</th>
            <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">대상 유저</th>
            <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">액션</th>
            <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">대상 타입</th>
            <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">IP</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.07] bg-surface">
          {auditData?.logs.map((log) => (
            <tr key={log.id} className="align-top transition-colors hover:bg-surface-deep/50">
              <td className="px-6 py-5 whitespace-nowrap font-mono text-xs text-content-secondary">
                {formatDateTime(log.created_at)}
              </td>
              <td className="px-6 py-5 whitespace-nowrap">
                <span className="font-mono text-xs font-medium text-content-primary">{log.admin_user_id.slice(0, 8)}…</span>
              </td>
              <td className="px-6 py-5 whitespace-nowrap">
                {log.target_user_id ? (
                  <span className="font-mono text-xs text-content-primary">{log.target_user_id.slice(0, 8)}…</span>
                ) : (
                  <span className="text-sm text-content-muted">—</span>
                )}
              </td>
              <td className="px-6 py-5 whitespace-nowrap text-sm text-content-primary">
                {log.action_type}
              </td>
              <td className="px-6 py-5 whitespace-nowrap text-sm text-content-secondary">
                {log.target_type ?? '—'}
              </td>
              <td className="px-6 py-5 whitespace-nowrap">
                <span className="font-mono text-xs text-content-secondary">{log.ip_address ?? '—'}</span>
              </td>
            </tr>
          ))}
          {auditData?.logs.length === 0 && (
            <tr>
              <td colSpan={6} className="px-6 py-12 text-center text-sm text-content-muted">감사 로그가 없습니다.</td>
            </tr>
          )}
        </tbody>
      </table>

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
