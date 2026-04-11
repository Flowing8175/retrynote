import { Activity, Users, AlertTriangle, CheckCircle, Server, ShieldCheck } from 'lucide-react';

interface AdminDashboardHeaderProps {
  usersCount: number;
  activeUsers: number;
  errors24h: number;
  errorRatePct: number;
}

export default function AdminDashboardHeader({
  usersCount,
  activeUsers,
  errors24h,
  errorRatePct,
}: AdminDashboardHeaderProps) {
  return (
    <section className="animate-fade-in-up rounded-3xl border border-white/[0.07] bg-surface px-6 py-5 md:px-8 md:py-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-brand-500/30 bg-brand-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-brand-300">
              <ShieldCheck className="h-3 w-3" />
              ADMIN
            </span>
             <span className="inline-flex items-center gap-1.5 rounded-md border border-semantic-success-border bg-semantic-success-bg px-2 py-0.5 font-mono text-[10px] font-medium text-semantic-success">
               <span className="h-1.5 w-1.5 rounded-full bg-semantic-success" />
               세션 인증됨
             </span>
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-content-primary md:text-3xl">관리자 대시보드</h1>
          <p className="mt-1.5 text-sm leading-6 text-content-secondary">
            학습자 상태, 시스템 로그, 모델 사용량을 한 화면 흐름에서 정리했습니다.
          </p>
        </div>
        <div className="hidden shrink-0 md:flex">
          <Server className="h-10 w-10 text-content-muted opacity-20" />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/[0.07] pt-5 sm:grid-cols-4">
        <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-surface-deep px-4 py-3">
          <Users className="h-4 w-4 shrink-0 text-brand-300" />
          <div className="min-w-0">
            <div className="text-xl font-semibold text-content-primary">{usersCount}</div>
            <div className="truncate text-xs text-content-muted">전체 사용자</div>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-surface-deep px-4 py-3">
           <CheckCircle className="h-4 w-4 shrink-0 text-semantic-success" />
          <div className="min-w-0">
            <div className="text-xl font-semibold text-semantic-success">{activeUsers}</div>
            <div className="truncate text-xs text-content-muted">활성 계정</div>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-surface-deep px-4 py-3">
           <AlertTriangle className={`h-4 w-4 shrink-0 ${errors24h > 0 ? 'text-semantic-error' : 'text-content-muted'}`} />
           <div className="min-w-0">
             <div className={`text-xl font-semibold ${errors24h > 0 ? 'text-semantic-error' : 'text-content-primary'}`}>{errors24h}</div>
            <div className="truncate text-xs text-content-muted">오류 (24h)</div>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-surface-deep px-4 py-3">
           <Activity className={`h-4 w-4 shrink-0 ${errorRatePct > 5 ? 'text-semantic-error' : 'text-content-muted'}`} />
           <div className="min-w-0">
             <div className={`text-xl font-semibold ${errorRatePct > 5 ? 'text-semantic-error' : 'text-content-primary'}`}>{errorRatePct.toFixed(1)}%</div>
            <div className="truncate text-xs text-content-muted">오류율</div>
          </div>
        </div>
      </div>
    </section>
  );
}
