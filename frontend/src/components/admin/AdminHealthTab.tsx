import { Database, RefreshCw, Users, CheckCircle, AlertTriangle, Activity, Server, Zap } from 'lucide-react';
import type { SystemHealthResponse } from '@/types';
import { formatDateTime, HealthStatusBadge, ComponentStatusDot } from './adminUtils';

interface AdminHealthTabProps {
  healthData: SystemHealthResponse | undefined;
  refetchHealth: () => void;
}

export default function AdminHealthTab({ healthData, refetchHealth }: AdminHealthTabProps) {
  return (
    <section className="space-y-4">
      {healthData ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.07] bg-surface-raised px-5 py-4">
            <div className="flex flex-wrap items-center gap-4">
              <HealthStatusBadge status={healthData.status} />
              <span className="font-mono text-xs text-content-muted">
                점검 시각: {formatDateTime(healthData.checked_at)}
              </span>
            </div>
            <button
              onClick={() => { void refetchHealth(); }}
              className="inline-flex items-center gap-2 rounded-xl border border-white/[0.07] bg-surface-deep px-3 py-2 text-xs font-medium text-content-secondary transition-colors hover:bg-surface-hover hover:text-content-primary"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              새로고침
            </button>
          </div>

          {Object.keys(healthData.components).length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(healthData.components).map(([name, comp]) => (
                <div
                  key={name}
                  className="rounded-2xl border border-white/[0.07] bg-surface-deep px-5 py-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <Database className="h-4 w-4 text-content-muted" />
                      <span className="font-mono text-xs font-semibold uppercase tracking-widest text-content-primary">
                        {name}
                      </span>
                    </div>
                    <ComponentStatusDot status={comp.status} />
                  </div>
                  {comp.latency_ms !== null && (
                    <div className="mt-2.5 font-mono text-sm font-medium text-content-primary">
                      {comp.latency_ms}
                      <span className="ml-1 text-xs font-normal text-content-muted">ms</span>
                    </div>
                  )}
                  {comp.detail && (
                    <p className="mt-1.5 text-xs leading-5 text-content-muted">{comp.detail}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
            <div className="rounded-2xl border border-white/[0.07] bg-surface-deep px-4 py-3">
              <div className="flex items-center gap-1.5 text-xs text-content-muted">
                <Users className="h-3.5 w-3.5" />
                전체 사용자
              </div>
              <div className="mt-2 font-mono text-xl font-semibold text-content-primary">{healthData.stats.total_users}</div>
            </div>
            <div className="rounded-2xl border border-white/[0.07] bg-surface-deep px-4 py-3">
              <div className="flex items-center gap-1.5 text-xs text-content-muted">
                <CheckCircle className="h-3.5 w-3.5" />
                활성 계정
              </div>
              <div className="mt-2 font-mono text-xl font-semibold text-semantic-success">{healthData.stats.active_users}</div>
            </div>
            <div className="rounded-2xl border border-white/[0.07] bg-surface-deep px-4 py-3">
              <div className="flex items-center gap-1.5 text-xs text-content-muted">
                <AlertTriangle className="h-3.5 w-3.5" />
                오류 (24h)
              </div>
               <div className={`mt-2 font-mono text-xl font-semibold ${healthData.stats.errors_24h > 0 ? 'text-semantic-error' : 'text-content-primary'}`}>
                 {healthData.stats.errors_24h}
               </div>
            </div>
            <div className="rounded-2xl border border-white/[0.07] bg-surface-deep px-4 py-3">
              <div className="flex items-center gap-1.5 text-xs text-content-muted">
                <Activity className="h-3.5 w-3.5" />
                오류율 (%)
              </div>
               <div className={`mt-2 font-mono text-xl font-semibold ${healthData.stats.error_rate_pct > 5 ? 'text-semantic-error' : 'text-content-primary'}`}>
                 {healthData.stats.error_rate_pct.toFixed(1)}
               </div>
            </div>
            <div className="rounded-2xl border border-white/[0.07] bg-surface-deep px-4 py-3">
              <div className="flex items-center gap-1.5 text-xs text-content-muted">
                <Server className="h-3.5 w-3.5" />
                로그 (24h)
              </div>
              <div className="mt-2 font-mono text-xl font-semibold text-content-primary">{healthData.stats.total_logs_24h}</div>
            </div>
            <div className="rounded-2xl border border-white/[0.07] bg-surface-deep px-4 py-3">
              <div className="flex items-center gap-1.5 text-xs text-content-muted">
                <Zap className="h-3.5 w-3.5" />
                대기 중 작업
              </div>
               <div className={`mt-2 font-mono text-xl font-semibold ${healthData.stats.pending_jobs > 0 ? 'text-semantic-warning' : 'text-content-primary'}`}>
                 {healthData.stats.pending_jobs}
               </div>
            </div>
            <div className="rounded-2xl border border-white/[0.07] bg-surface-deep px-4 py-3">
              <div className="flex items-center gap-1.5 text-xs text-content-muted">
                <AlertTriangle className="h-3.5 w-3.5" />
                실패 작업 (24h)
              </div>
               <div className={`mt-2 font-mono text-xl font-semibold ${healthData.stats.failed_jobs_24h > 0 ? 'text-semantic-error' : 'text-content-primary'}`}>
                 {healthData.stats.failed_jobs_24h}
               </div>
            </div>
          </div>
        </>
      ) : (
        <div className="rounded-3xl border border-white/[0.07] bg-surface px-6 py-12 text-center">
          <Server className="mx-auto h-10 w-10 text-content-muted opacity-30" />
          <p className="mt-4 text-sm text-content-muted">시스템 상태 데이터를 불러올 수 없습니다.</p>
          <button
            onClick={() => { void refetchHealth(); }}
            className="mt-4 inline-flex items-center gap-2 rounded-xl border border-white/[0.07] bg-surface-deep px-4 py-2 text-sm font-medium text-content-secondary transition-colors hover:text-content-primary"
          >
            <RefreshCw className="h-4 w-4" />
            다시 시도
          </button>
        </div>
      )}
    </section>
  );
}
