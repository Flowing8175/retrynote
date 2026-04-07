import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  Database,
  Users,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Server,
  Zap,
  ShieldCheck,
} from 'lucide-react';
import { adminApi } from '@/api';
import { LoadingSpinner, StatusBadge } from '@/components';
import { useAuthStore } from '@/stores/authStore';
import type { AnnouncementCreate, ModelSettingsUpdate, SystemHealthResponse } from '@/types';

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatRelative(value: string | null): string {
  if (!value) return '미접속';
  const now = new Date();
  const date = new Date(value);
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60_000);
  if (diffMinutes < 1) return '방금 전';
  if (diffMinutes < 60) return `${diffMinutes}분 전`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}시간 전`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return '1일 전';
  if (diffDays < 30) return `${diffDays}일 전`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths}개월 전`;
  return `${Math.floor(diffMonths / 12)}년 전`;
}

function LogLevelBadge({ level }: { level: string }) {
  const normalized = level.toUpperCase();
  let cls = '';
  if (normalized === 'ERROR' || normalized === 'CRITICAL') {
    cls = 'bg-red-500/15 text-red-400 border border-red-500/20';
  } else if (normalized === 'WARNING' || normalized === 'WARN') {
    cls = 'bg-amber-500/15 text-amber-400 border border-amber-500/20';
  } else if (normalized === 'INFO') {
    cls = 'bg-teal-500/15 text-teal-300 border border-teal-500/20';
  } else {
    cls = 'bg-white/5 text-content-muted border border-white/[0.07]';
  }
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 font-mono text-xs font-medium ${cls}`}>
      {normalized}
    </span>
  );
}

function HealthStatusBadge({ status }: { status: SystemHealthResponse['status'] }) {
  const config = {
    ok: { cls: 'bg-green-500/15 text-green-400 border border-green-500/20', dot: 'bg-green-400', label: 'OK', pulse: true },
    degraded: { cls: 'bg-amber-500/15 text-amber-400 border border-amber-500/20', dot: 'bg-amber-400', label: 'DEGRADED', pulse: false },
    down: { cls: 'bg-red-500/15 text-red-400 border border-red-500/20', dot: 'bg-red-400', label: 'DOWN', pulse: false },
  } as const;
  const { cls, dot, label, pulse } = config[status];
  return (
    <span className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 font-mono text-sm font-semibold ${cls}`}>
      <span className="relative flex h-2 w-2">
        {pulse && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-50" />}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${dot}`} />
      </span>
      {label}
    </span>
  );
}

function ComponentStatusDot({ status }: { status: 'ok' | 'degraded' | 'down' }) {
  if (status === 'ok') {
    return (
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-40" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-400" />
      </span>
    );
  }
  if (status === 'degraded') {
    return <span className="inline-flex h-2.5 w-2.5 rounded-full bg-amber-400" />;
  }
  return <span className="inline-flex h-2.5 w-2.5 rounded-full bg-red-400" />;
}

type TabKey =
  | 'health'
  | 'users'
  | 'logs'
  | 'models'
  | 'audit'
  | 'announcements'
  | 'impersonation'
  | 'model_settings';

const tabs: { key: TabKey; label: string; helper: string }[] = [
  { key: 'health', label: '진단', helper: '시스템 상태 실시간 점검' },
  { key: 'users', label: '사용자', helper: '학습 계정 상태 확인' },
  { key: 'logs', label: '시스템 로그', helper: '최근 운영 흐름 확인' },
  { key: 'models', label: '모델 사용량', helper: '요청량과 사용 흐름 확인' },
  { key: 'audit', label: '감사 로그', helper: '관리자 행위 추적' },
  { key: 'announcements', label: '공지 관리', helper: '배너/공지 생성 및 관리' },
  { key: 'impersonation', label: '가장 모드', helper: '사용자 화면으로 이동' },
  { key: 'model_settings', label: '모델 설정', helper: 'AI 모델 변경' },
];

const LOG_LEVELS = ['전체', 'INFO', 'WARNING', 'ERROR'] as const;

export default function Admin() {
  const queryClient = useQueryClient();
  const { setImpersonation, endImpersonation: storeEndImpersonation, setAdminToken } = useAuthStore();

  const [activeTab, setActiveTab] = useState<TabKey>('health');
  const [masterPassword, setMasterPassword] = useState('');
  const [isVerified, setIsVerified] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const [auditPage, setAuditPage] = useState(1);

  const [announcementForm, setAnnouncementForm] = useState<AnnouncementCreate>({
    title: '',
    body: '',
    is_active: true,
    starts_at: null,
    ends_at: null,
  });

  const [impersonationId, setImpersonationId] = useState<string | null>(null);
  const [impersonatingTarget, setImpersonatingTarget] = useState<string | null>(null);

  const [modelForm, setModelForm] = useState<ModelSettingsUpdate>({
    active_generation_model: null,
    active_grading_model: null,
    fallback_generation_model: null,
    fallback_grading_model: null,
  });
  const [modelSaveMsg, setModelSaveMsg] = useState<string | null>(null);

  const [logLevelFilter, setLogLevelFilter] = useState<string | null>(null);

  const { data: healthData, isLoading: healthLoading, refetch: refetchHealth } = useQuery({
    queryKey: ['admin-health'],
    queryFn: () => adminApi.getSystemHealth(),
    enabled: isVerified && activeTab === 'health',
    staleTime: 30_000,
  });

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => adminApi.listUsers(),
    enabled: isVerified,
  });

  const { data: logsData, isLoading: logsLoading } = useQuery({
    queryKey: ['admin-logs', logLevelFilter],
    queryFn: () => adminApi.listLogs(1, 50, logLevelFilter),
    enabled: isVerified && activeTab === 'logs',
  });

  const { data: modelData, isLoading: modelLoading } = useQuery({
    queryKey: ['admin-models'],
    queryFn: () => adminApi.getModelUsage(),
    enabled: isVerified && activeTab === 'models',
  });

  const { data: auditData, isLoading: auditLoading } = useQuery({
    queryKey: ['admin-audit', auditPage],
    queryFn: () => adminApi.getAuditLogs(auditPage, 20),
    enabled: isVerified && activeTab === 'audit',
  });

  const { data: announcementsData, isLoading: announcementsLoading } = useQuery({
    queryKey: ['admin-announcements'],
    queryFn: () => adminApi.listAnnouncements(),
    enabled: isVerified && activeTab === 'announcements',
  });

  const verifyMutation = useMutation({
    mutationFn: () => adminApi.verifyMasterPassword({ master_password: masterPassword }),
    onSuccess: (data) => {
      if (data.admin_token) {
        setAdminToken(data.admin_token);
      }
      setIsVerified(true);
    },
    onError: () => {
      setVerifyError('비밀번호가 올바르지 않습니다.');
    },
  });

  const createAnnouncementMutation = useMutation({
    mutationFn: (data: AnnouncementCreate) => adminApi.createAnnouncement(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-announcements'] });
      setAnnouncementForm({ title: '', body: '', is_active: true, starts_at: null, ends_at: null });
    },
  });

  const startImpersonationMutation = useMutation({
    mutationFn: (targetUserId: string) =>
      adminApi.startImpersonation({ target_user_id: targetUserId, reason: '관리자 점검' }),
    onSuccess: (data) => {
      setImpersonationId(data.impersonation_id);
      setImpersonatingTarget(data.target_username);
      setImpersonation(data.target_user_id, data.target_username, data.impersonation_id);
    },
  });

  const endImpersonationMutation = useMutation({
    mutationFn: (id: string) => adminApi.endImpersonation(id),
    onSuccess: () => {
      setImpersonationId(null);
      setImpersonatingTarget(null);
      storeEndImpersonation();
    },
  });

  const updateModelSettingsMutation = useMutation({
    mutationFn: (data: ModelSettingsUpdate) => adminApi.updateModelSettings(data),
    onSuccess: () => {
      setModelSaveMsg('설정이 저장되었습니다');
      setTimeout(() => setModelSaveMsg(null), 3000);
    },
    onError: (err: unknown) => {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 403) {
        setModelSaveMsg('권한이 부족합니다. super_admin 권한이 필요합니다.');
      } else {
        setModelSaveMsg('저장 중 오류가 발생했습니다.');
      }
      setTimeout(() => setModelSaveMsg(null), 4000);
    },
  });

  if (!isVerified) {
    return (
      <div className="mx-auto max-w-3xl pt-8">
        <section className="rounded-3xl border border-white/[0.07] bg-surface px-6 py-7 md:px-8 md:py-8">
          <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_18rem] md:items-start">
            <div>
              <p className="text-sm font-medium text-brand-300">관리자 인증</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-content-primary">운영 화면에 들어가기 전에 한 번 더 확인합니다.</h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-content-secondary">
                관리자 영역은 학습자 화면과 다른 권한을 다루므로 마스터 비밀번호로 한 번 더 인증합니다. 인증 후에는 사용자 상태와 운영 로그를 같은 흐름에서 확인할 수 있어요.
              </p>
            </div>

            <div className="rounded-2xl border border-white/[0.07] bg-surface-deep px-5 py-5">
              <label className="block text-sm font-medium text-content-primary" htmlFor="master-password">
                마스터 비밀번호
              </label>
              <input
                id="master-password"
                type="password"
                value={masterPassword}
                onChange={(e) => { setMasterPassword(e.target.value); setVerifyError(null); }}
                placeholder="비밀번호 입력"
                className="mt-3 w-full rounded-2xl border border-white/[0.10] bg-surface px-4 py-3 text-content-primary placeholder-content-muted focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
              <p className="mt-3 text-sm leading-6 text-content-secondary">공용 환경이라면 인증 후 로그아웃을 먼저 확인해 주세요.</p>
              <button
                onClick={() => verifyMutation.mutate()}
                disabled={verifyMutation.isPending || !masterPassword}
                className="mt-5 inline-flex w-full items-center justify-center rounded-2xl bg-brand-500 px-4 py-3 text-sm font-bold text-content-inverse transition-colors hover:bg-brand-600 disabled:opacity-50"
              >
                {verifyMutation.isPending ? '인증 중…' : '관리자 화면 열기'}
              </button>
              {verifyError && (
                <p className="mt-3 text-sm text-semantic-error">{verifyError}</p>
              )}
            </div>
          </div>
        </section>
      </div>
    );
  }

  const usersCount = healthData?.stats.total_users ?? usersData?.users.length ?? 0;
  const activeUsers = healthData?.stats.active_users ?? usersData?.users.filter((u) => u.is_active).length ?? 0;
  const errors24h = healthData?.stats.errors_24h ?? 0;
  const errorRatePct = healthData?.stats.error_rate_pct ?? 0;
  const auditTotalPages = auditData ? Math.max(1, Math.ceil(auditData.total / 20)) : 1;

  return (
    <div className="space-y-6">
      <section className="animate-fade-in-up rounded-3xl border border-white/[0.07] bg-surface px-6 py-5 md:px-8 md:py-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-md border border-brand-500/30 bg-brand-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-brand-300">
                <ShieldCheck className="h-3 w-3" />
                ADMIN
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-green-500/20 bg-green-500/10 px-2 py-0.5 font-mono text-[10px] font-medium text-green-400">
                <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
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
            <CheckCircle className="h-4 w-4 shrink-0 text-green-400" />
            <div className="min-w-0">
              <div className="text-xl font-semibold text-semantic-success">{activeUsers}</div>
              <div className="truncate text-xs text-content-muted">활성 계정</div>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-surface-deep px-4 py-3">
            <AlertTriangle className={`h-4 w-4 shrink-0 ${errors24h > 0 ? 'text-red-400' : 'text-content-muted'}`} />
            <div className="min-w-0">
              <div className={`text-xl font-semibold ${errors24h > 0 ? 'text-red-400' : 'text-content-primary'}`}>{errors24h}</div>
              <div className="truncate text-xs text-content-muted">오류 (24h)</div>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-surface-deep px-4 py-3">
            <Activity className={`h-4 w-4 shrink-0 ${errorRatePct > 5 ? 'text-red-400' : 'text-content-muted'}`} />
            <div className="min-w-0">
              <div className={`text-xl font-semibold ${errorRatePct > 5 ? 'text-red-400' : 'text-content-primary'}`}>{errorRatePct.toFixed(1)}%</div>
              <div className="truncate text-xs text-content-muted">오류율</div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-white/[0.07]">
        <nav className="-mb-px flex overflow-x-auto">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-brand-500 text-brand-300'
                    : 'border-transparent text-content-secondary hover:border-white/[0.20] hover:text-content-primary'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
      </section>

      {activeTab === 'health' && healthLoading && <LoadingSpinner message="시스템 상태 점검 중" />}
      {activeTab === 'users' && usersLoading && <LoadingSpinner message="사용자 목록 정리 중" />}
      {activeTab === 'logs' && logsLoading && <LoadingSpinner message="시스템 로그 정리 중" />}
      {activeTab === 'models' && modelLoading && <LoadingSpinner message="모델 사용량 불러오는 중" />}
      {activeTab === 'audit' && auditLoading && <LoadingSpinner message="감사 로그 불러오는 중" />}
      {activeTab === 'announcements' && announcementsLoading && <LoadingSpinner message="공지 목록 불러오는 중" />}

      {activeTab === 'health' && !healthLoading && (
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
                  <div className={`mt-2 font-mono text-xl font-semibold ${healthData.stats.errors_24h > 0 ? 'text-red-400' : 'text-content-primary'}`}>
                    {healthData.stats.errors_24h}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/[0.07] bg-surface-deep px-4 py-3">
                  <div className="flex items-center gap-1.5 text-xs text-content-muted">
                    <Activity className="h-3.5 w-3.5" />
                    오류율 (%)
                  </div>
                  <div className={`mt-2 font-mono text-xl font-semibold ${healthData.stats.error_rate_pct > 5 ? 'text-red-400' : 'text-content-primary'}`}>
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
                  <div className={`mt-2 font-mono text-xl font-semibold ${healthData.stats.pending_jobs > 0 ? 'text-amber-400' : 'text-content-primary'}`}>
                    {healthData.stats.pending_jobs}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/[0.07] bg-surface-deep px-4 py-3">
                  <div className="flex items-center gap-1.5 text-xs text-content-muted">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    실패 작업 (24h)
                  </div>
                  <div className={`mt-2 font-mono text-xl font-semibold ${healthData.stats.failed_jobs_24h > 0 ? 'text-red-400' : 'text-content-primary'}`}>
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
      )}

      {activeTab === 'users' && !usersLoading && (
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
      )}

      {activeTab === 'logs' && !logsLoading && (
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
      )}

      {activeTab === 'models' && !modelLoading && (
        <section className="rounded-3xl border border-white/[0.07] bg-surface p-6 md:p-7">
          <h2 className="text-xl font-semibold text-content-primary">모델 사용량</h2>
          <p className="mt-2 text-sm leading-6 text-content-secondary">요청 수와 토큰 사용량을 함께 보면서 운영 부담을 차분하게 확인할 수 있습니다.</p>
          {modelData?.usage.map((model) => (
            <div key={model.model_name} className="mt-5 rounded-2xl border border-white/[0.07] bg-surface-deep px-5 py-5 first:mt-6">
              <div className="text-lg font-semibold text-content-primary">{model.model_name}</div>
              <div className="mt-4 grid gap-4 text-sm md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border border-white/[0.07] bg-surface px-4 py-3">
                  <div className="text-content-secondary">요청 수</div>
                  <div className="font-mono font-medium text-content-primary">{model.request_count.toLocaleString()}</div>
                </div>
                <div className="rounded-xl border border-white/[0.07] bg-surface px-4 py-3">
                  <div className="text-content-secondary">입력 토큰</div>
                  <div className="font-mono font-medium text-content-primary">{model.input_tokens.toLocaleString()}</div>
                </div>
                <div className="rounded-xl border border-white/[0.07] bg-surface px-4 py-3">
                  <div className="text-content-secondary">출력 토큰</div>
                  <div className="font-mono font-medium text-content-primary">{model.output_tokens.toLocaleString()}</div>
                </div>
                <div className="rounded-xl border border-white/[0.07] bg-surface px-4 py-3">
                  <div className="text-content-secondary">실패 건수</div>
                  <div className={`font-mono font-medium ${model.failure_count > 0 ? 'text-red-400' : 'text-content-primary'}`}>
                    {model.failure_count}
                  </div>
                </div>
              </div>
            </div>
          ))}
          {(!modelData || modelData.usage.length === 0) && (
            <p className="mt-8 text-center text-sm text-content-muted">모델 사용 데이터가 없습니다.</p>
          )}
        </section>
      )}

      {activeTab === 'audit' && !auditLoading && (
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
      )}

      {activeTab === 'announcements' && !announcementsLoading && (
        <section className="space-y-6">
          <div className="overflow-hidden rounded-3xl border border-white/[0.07] bg-surface">
            <table className="min-w-full divide-y divide-white/[0.07]">
              <thead className="bg-surface-raised">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">제목</th>
                  <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">내용</th>
                  <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">상태</th>
                  <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">시작일</th>
                  <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">종료일</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.07] bg-surface">
                {announcementsData?.map((ann) => (
                  <tr key={ann.id} className="align-top transition-colors hover:bg-surface-deep/50">
                    <td className="px-6 py-5 whitespace-nowrap text-sm font-medium text-content-primary">{ann.title}</td>
                    <td className="max-w-xs truncate px-6 py-5 text-sm text-content-secondary">
                      {ann.body.length > 50 ? `${ann.body.slice(0, 50)}…` : ann.body}
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap text-sm">
                      <StatusBadge status={ann.is_active ? 'active' : 'inactive'} />
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap text-sm text-content-secondary">
                      {ann.starts_at ? formatDateTime(ann.starts_at) : '—'}
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap text-sm text-content-secondary">
                      {ann.ends_at ? formatDateTime(ann.ends_at) : '—'}
                    </td>
                  </tr>
                ))}
                {(!announcementsData || announcementsData.length === 0) && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-sm text-content-muted">등록된 공지가 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="rounded-3xl border border-white/[0.07] bg-surface p-6 md:p-7">
            <h2 className="text-xl font-semibold text-content-primary">새 공지 만들기</h2>
            <p className="mt-2 text-sm leading-6 text-content-secondary">배너에 노출할 공지를 작성합니다.</p>

            <div className="mt-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-content-primary" htmlFor="ann-title">제목</label>
                <input
                  id="ann-title"
                  type="text"
                  value={announcementForm.title}
                  onChange={(e) => setAnnouncementForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="공지 제목"
                  className="mt-2 w-full rounded-2xl border border-white/[0.07] bg-surface-deep px-4 py-3 text-sm text-content-primary placeholder-content-muted"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-content-primary" htmlFor="ann-body">내용</label>
                <textarea
                  id="ann-body"
                  rows={3}
                  value={announcementForm.body}
                  onChange={(e) => setAnnouncementForm((f) => ({ ...f, body: e.target.value }))}
                  placeholder="공지 내용을 입력하세요"
                  className="mt-2 w-full resize-none rounded-2xl border border-white/[0.07] bg-surface-deep px-4 py-3 text-sm text-content-primary placeholder-content-muted"
                />
              </div>

              <div className="flex items-center gap-3">
                <input
                  id="ann-active"
                  type="checkbox"
                  checked={announcementForm.is_active}
                  onChange={(e) => setAnnouncementForm((f) => ({ ...f, is_active: e.target.checked }))}
                  className="h-4 w-4 rounded border-white/[0.07] text-brand-500 focus:ring-brand-500"
                />
                <label className="text-sm font-medium text-content-primary" htmlFor="ann-active">활성 여부</label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-content-primary" htmlFor="ann-starts">시작일</label>
                  <input
                    id="ann-starts"
                    type="datetime-local"
                    value={announcementForm.starts_at ?? ''}
                    onChange={(e) => setAnnouncementForm((f) => ({ ...f, starts_at: e.target.value || null }))}
                    className="mt-2 w-full rounded-2xl border border-white/[0.07] bg-surface-deep px-4 py-3 text-sm text-content-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-content-primary" htmlFor="ann-ends">종료일</label>
                  <input
                    id="ann-ends"
                    type="datetime-local"
                    value={announcementForm.ends_at ?? ''}
                    onChange={(e) => setAnnouncementForm((f) => ({ ...f, ends_at: e.target.value || null }))}
                    className="mt-2 w-full rounded-2xl border border-white/[0.07] bg-surface-deep px-4 py-3 text-sm text-content-primary"
                  />
                </div>
              </div>

              <button
                onClick={() => createAnnouncementMutation.mutate(announcementForm)}
                disabled={createAnnouncementMutation.isPending || !announcementForm.title || !announcementForm.body}
                className="inline-flex items-center justify-center rounded-2xl bg-brand-500 px-6 py-3 text-sm font-semibold text-content-inverse transition-colors hover:bg-brand-600 disabled:opacity-50"
              >
                {createAnnouncementMutation.isPending ? '저장 중…' : '공지 등록'}
              </button>
            </div>
          </div>
        </section>
      )}

      {activeTab === 'impersonation' && (
        <section className="space-y-6">
          {impersonationId && impersonatingTarget && (
            <div className="rounded-3xl border border-brand-500/30 bg-brand-500/5 p-6 md:p-7">
              <h2 className="text-xl font-semibold text-content-primary">가장 모드 활성</h2>
              <p className="mt-2 text-sm leading-6 text-content-secondary">
                현재 <span className="font-semibold text-brand-500">{impersonatingTarget}</span> 계정으로 가장 중입니다. 종료 버튼을 누르면 가장이 종료됩니다.
              </p>
              <button
                onClick={() => endImpersonationMutation.mutate(impersonationId)}
                disabled={endImpersonationMutation.isPending}
                className="mt-4 inline-flex items-center justify-center rounded-2xl border border-semantic-error-border/30 px-6 py-3 text-sm font-semibold text-semantic-error transition-colors hover:bg-semantic-error-bg/50 disabled:opacity-50"
              >
                {endImpersonationMutation.isPending ? '종료 중…' : '가장 종료'}
              </button>
            </div>
          )}

          {usersLoading ? (
            <LoadingSpinner message="사용자 목록 불러오는 중" />
          ) : (
            <div className="overflow-hidden rounded-3xl border border-white/[0.07] bg-surface">
              <table className="min-w-full divide-y divide-white/[0.07]">
                <thead className="bg-surface-raised">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">사용자</th>
                    <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">이메일</th>
                    <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">액션</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.07] bg-surface">
                  {usersData?.users.map((user) => (
                    <tr key={user.id} className="align-top transition-colors hover:bg-surface-deep/50">
                      <td className="px-6 py-5 whitespace-nowrap text-sm font-medium text-content-primary">{user.username}</td>
                      <td className="px-6 py-5 whitespace-nowrap text-sm text-content-secondary">{user.email}</td>
                      <td className="px-6 py-5 whitespace-nowrap text-sm">
                        <button
                          onClick={() => startImpersonationMutation.mutate(user.id)}
                          disabled={startImpersonationMutation.isPending || !!impersonationId}
                          className="rounded-xl border border-brand-500/25 px-4 py-2 text-sm font-medium text-brand-300 transition-colors hover:bg-brand-500/10 disabled:opacity-40"
                        >
                          가장 시작
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {activeTab === 'model_settings' && (
        <section className="rounded-3xl border border-white/[0.07] bg-surface p-6 md:p-7">
          <h2 className="text-xl font-semibold text-content-primary">모델 설정</h2>
          <p className="mt-2 text-sm leading-6 text-content-secondary">
            AI 문제 생성 및 채점에 사용할 모델을 변경합니다. super_admin 권한이 필요합니다.
          </p>

          <div className="mt-6 space-y-5">
            <div>
              <label className="block text-sm font-medium text-content-primary" htmlFor="ms-gen">생성 모델</label>
              <input
                id="ms-gen"
                type="text"
                value={modelForm.active_generation_model ?? ''}
                onChange={(e) => setModelForm((f) => ({ ...f, active_generation_model: e.target.value || null }))}
                placeholder="gpt-4o"
                className="mt-2 w-full rounded-2xl border border-white/[0.07] bg-surface-deep px-4 py-3 text-sm text-content-primary placeholder-content-muted"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-content-primary" htmlFor="ms-grade">채점 모델</label>
              <input
                id="ms-grade"
                type="text"
                value={modelForm.active_grading_model ?? ''}
                onChange={(e) => setModelForm((f) => ({ ...f, active_grading_model: e.target.value || null }))}
                placeholder="gpt-4o-mini"
                className="mt-2 w-full rounded-2xl border border-white/[0.07] bg-surface-deep px-4 py-3 text-sm text-content-primary placeholder-content-muted"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-content-primary" htmlFor="ms-gen-fb">생성 폴백 모델</label>
              <input
                id="ms-gen-fb"
                type="text"
                value={modelForm.fallback_generation_model ?? ''}
                onChange={(e) => setModelForm((f) => ({ ...f, fallback_generation_model: e.target.value || null }))}
                placeholder="gpt-4o-mini"
                className="mt-2 w-full rounded-2xl border border-white/[0.07] bg-surface-deep px-4 py-3 text-sm text-content-primary placeholder-content-muted"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-content-primary" htmlFor="ms-grade-fb">채점 폴백 모델</label>
              <input
                id="ms-grade-fb"
                type="text"
                value={modelForm.fallback_grading_model ?? ''}
                onChange={(e) => setModelForm((f) => ({ ...f, fallback_grading_model: e.target.value || null }))}
                placeholder="gpt-3.5-turbo"
                className="mt-2 w-full rounded-2xl border border-white/[0.07] bg-surface-deep px-4 py-3 text-sm text-content-primary placeholder-content-muted"
              />
            </div>

            {modelSaveMsg && (
              <div
                className={`rounded-2xl px-4 py-3 text-sm font-medium ${
                  modelSaveMsg.includes('저장되었습니다')
                    ? 'border border-green-500/20 bg-green-500/10 text-green-400'
                    : 'border border-red-500/20 bg-red-500/10 text-red-400'
                }`}
              >
                {modelSaveMsg}
              </div>
            )}

            <button
              onClick={() => updateModelSettingsMutation.mutate(modelForm)}
              disabled={updateModelSettingsMutation.isPending}
              className="inline-flex items-center justify-center rounded-2xl bg-brand-500 px-6 py-3 text-sm font-semibold text-content-inverse transition-colors hover:bg-brand-600 disabled:opacity-50"
            >
              {updateModelSettingsMutation.isPending ? '저장 중…' : '설정 저장'}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
