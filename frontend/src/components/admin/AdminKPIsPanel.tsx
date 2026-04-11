import { useQuery } from '@tanstack/react-query';
import { TrendingUp, Users, HardDrive, Zap, AlertTriangle, Calendar, Activity, Server } from 'lucide-react';
import { adminApi } from '@/api';

interface AdminKPIsPanelProps {
  isVerified: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function bytesToMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)}`;
}

const STATUS_COLOR: Record<string, string> = {
  failed: 'text-semantic-error',
  pending: 'text-semantic-warning',
  running: 'text-brand-300',
  completed: 'text-semantic-success',
};

export default function AdminKPIsPanel({ isVerified }: AdminKPIsPanelProps) {
  const { data: kpis, isLoading, error } = useQuery({
    queryKey: ['admin-kpis'],
    queryFn: () => adminApi.getDashboardKPIs(),
    enabled: isVerified,
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-white/[0.07] bg-surface-deep px-6 py-10 text-center">
        <p className="font-mono text-xs text-content-muted">KPI 데이터 불러오는 중…</p>
      </div>
    );
  }

  if (error || !kpis) {
    return (
      <div className="rounded-2xl border border-white/[0.07] bg-surface-deep px-6 py-10 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-content-muted opacity-30" />
        <p className="mt-3 text-sm text-content-muted">KPI 데이터를 불러올 수 없습니다.</p>
      </div>
    );
  }

  const queueByStatus = kpis.job_queue.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = (acc[item.status] ?? 0) + item.count;
    return acc;
  }, {});

  const topErrors = kpis.top_errors_24h.slice(0, 3);
  const topUsers = kpis.top_users_by_storage.slice(0, 5);

  return (
    <section className="space-y-3">
      <div className="rounded-2xl border border-white/[0.07] bg-surface-raised px-5 py-3">
        <h3 className="font-mono text-xs font-semibold uppercase tracking-widest text-content-muted">
          대시보드 KPI
        </h3>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-white/[0.07] bg-surface-deep px-4 py-3">
          <div className="flex items-center gap-1.5 text-xs text-content-muted">
            <TrendingUp className="h-3.5 w-3.5" />
            오늘 퀴즈
          </div>
          <div className="mt-2 font-mono text-xl font-semibold text-content-primary">
            {kpis.quizzes_today}
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.07] bg-surface-deep px-4 py-3">
          <div className="flex items-center gap-1.5 text-xs text-content-muted">
            <Zap className="h-3.5 w-3.5" />
            총 퀴즈 작업
          </div>
          <div className="mt-2 font-mono text-xl font-semibold text-content-primary">
            {kpis.total_quiz_jobs}
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.07] bg-surface-deep px-4 py-3">
          <div className="flex items-center gap-1.5 text-xs text-content-muted">
            <Calendar className="h-3.5 w-3.5" />
            신규 가입 (7일)
          </div>
          <div className="mt-2 font-mono text-xl font-semibold text-content-primary">
            {kpis.signups_7d}
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.07] bg-surface-deep px-4 py-3">
          <div className="flex items-center gap-1.5 text-xs text-content-muted">
            <Activity className="h-3.5 w-3.5" />
            DAU
          </div>
          <div className="mt-2 font-mono text-xl font-semibold text-content-primary">
            {kpis.dau}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/[0.07] bg-surface-deep px-4 py-3">
        <div className="flex items-center gap-1.5 text-xs text-content-muted">
          <HardDrive className="h-3.5 w-3.5" />
          전체 스토리지 사용량
        </div>
        <div className="mt-2 font-mono text-xl font-semibold text-content-primary">
          {formatBytes(kpis.total_storage_bytes)}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/[0.07] bg-surface-deep px-4 py-4">
          <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-content-muted">
            <Users className="h-3.5 w-3.5" />
            스토리지 Top 5
          </div>
          {topUsers.length === 0 ? (
            <p className="text-xs text-content-muted">데이터 없음</p>
          ) : (
            <ol className="space-y-2">
              {topUsers.map((user, idx) => (
                <li key={user.username} className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-content-muted">{idx + 1}.</span>
                  <span className="flex-1 truncate text-xs text-content-secondary">
                    {user.username}
                  </span>
                  <span className="font-mono text-xs font-semibold text-content-primary">
                    {bytesToMB(user.storage_used_bytes)} MB
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="rounded-2xl border border-white/[0.07] bg-surface-deep px-4 py-4">
          <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-content-muted">
            <AlertTriangle className="h-3.5 w-3.5" />
            주요 오류 Top 3
          </div>
          {topErrors.length === 0 ? (
            <p className="text-xs text-content-muted">오류 없음</p>
          ) : (
            <ol className="space-y-2">
              {topErrors.map((err, idx) => (
                <li key={err.event_type} className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-content-muted">{idx + 1}.</span>
                  <span className="flex-1 truncate text-xs text-content-secondary">
                    {err.event_type}
                  </span>
                   <span className="font-mono text-xs font-semibold text-semantic-error">
                     {err.count}
                   </span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="rounded-2xl border border-white/[0.07] bg-surface-deep px-4 py-4">
          <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-content-muted">
            <Server className="h-3.5 w-3.5" />
            작업 대기열
          </div>
          {Object.keys(queueByStatus).length === 0 ? (
            <p className="text-xs text-content-muted">대기 중 작업 없음</p>
          ) : (
            <ul className="space-y-2">
              {Object.entries(queueByStatus).map(([status, count]) => (
                <li key={status} className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-content-secondary">{status}</span>
                  <span
                    className={`font-mono text-xs font-semibold ${STATUS_COLOR[status] ?? 'text-content-primary'}`}
                  >
                    {count}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
