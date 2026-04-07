import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/api';
import { LoadingSpinner, StatusBadge } from '@/components';
import { useAuthStore } from '@/stores/authStore';
import type { AnnouncementCreate, ModelSettingsUpdate } from '@/types';

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

type TabKey = 'users' | 'logs' | 'models' | 'audit' | 'announcements' | 'impersonation' | 'model_settings';

const tabs: { key: TabKey; label: string; helper: string }[] = [
  { key: 'users', label: '사용자', helper: '학습 계정 상태 확인' },
  { key: 'logs', label: '시스템 로그', helper: '최근 운영 흐름 확인' },
  { key: 'models', label: '모델 사용량', helper: '요청량과 사용 흐름 확인' },
  { key: 'audit', label: '감사 로그', helper: '관리자 행위 추적' },
  { key: 'announcements', label: '공지 관리', helper: '배너/공지 생성 및 관리' },
  { key: 'impersonation', label: '가장 모드', helper: '사용자 화면으로 이동' },
  { key: 'model_settings', label: '모델 설정', helper: 'AI 모델 변경' },
];

export default function Admin() {
  const queryClient = useQueryClient();
  const { setImpersonation, endImpersonation: storeEndImpersonation, setAdminToken } = useAuthStore();

  const [activeTab, setActiveTab] = useState<TabKey>('users');
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

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => adminApi.listUsers(),
    enabled: isVerified,
  });

  const { data: logsData, isLoading: logsLoading } = useQuery({
    queryKey: ['admin-logs'],
    queryFn: () => adminApi.listLogs(),
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

  const usersCount = usersData?.users.length ?? 0;
  const activeUsers = usersData?.users.filter((user) => user.is_active).length ?? 0;
  const logsCount = logsData?.logs.length ?? 0;
  const auditTotalPages = auditData ? Math.max(1, Math.ceil(auditData.total / 20)) : 1;

  return (
    <div className="space-y-8">
      <section className="animate-fade-in-up rounded-3xl border border-white/[0.07] bg-surface px-6 py-7 md:px-8 md:py-8">
        <p className="text-sm font-medium text-brand-300">운영 개요</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-content-primary md:text-4xl">관리자 대시보드</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-content-secondary">
          학습자 상태, 시스템 로그, 모델 사용량을 한 화면 흐름에서 정리했습니다.
        </p>

        <div className="mt-6 flex flex-wrap items-baseline gap-x-8 gap-y-3 border-t border-white/[0.07] pt-6 text-sm">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-content-primary">{usersCount}</span>
            <span className="text-content-secondary">사용자</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-semantic-success">{activeUsers}</span>
            <span className="text-content-secondary">활성 계정</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-content-primary">{logsCount}</span>
            <span className="text-content-secondary">최근 로그</span>
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

      {activeTab === 'users' && usersLoading ? <LoadingSpinner message="사용자 목록 정리 중" /> : null}
      {activeTab === 'logs' && logsLoading ? <LoadingSpinner message="시스템 로그 정리 중" /> : null}
      {activeTab === 'models' && modelLoading ? <LoadingSpinner message="모델 사용량 불러오는 중" /> : null}
      {activeTab === 'audit' && auditLoading ? <LoadingSpinner message="감사 로그 불러오는 중" /> : null}
      {activeTab === 'announcements' && announcementsLoading ? <LoadingSpinner message="공지 목록 불러오는 중" /> : null}

      {/* ══════════════════════════════════════════════════
          TAB: 사용자
         ══════════════════════════════════════════════════ */}
      {activeTab === 'users' && !usersLoading && (
        <section className="overflow-hidden rounded-3xl border border-white/[0.07] bg-surface">
          <table className="min-w-full divide-y divide-white/[0.07]">
            <thead className="bg-surface-raised">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">
                  사용자
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">
                  이메일
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">
                  가입일
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">
                  저장공간
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">
                  상태
                </th>
              </tr>
            </thead>
            <tbody className="bg-surface divide-y divide-white/[0.07]">
              {usersData?.users.map((user) => (
                <tr key={user.id} className="align-top transition-colors hover:bg-surface-deep/50">
                  <td className="px-6 py-5 whitespace-nowrap text-sm text-content-primary">
                    <div className="font-medium text-content-primary">{user.username}</div>
                  </td>
                  <td className="px-6 py-5 whitespace-nowrap text-sm text-content-primary">
                    {user.email}
                  </td>
                  <td className="px-6 py-5 whitespace-nowrap text-sm text-content-secondary">
                    {formatDateTime(user.created_at)}
                  </td>
                  <td className="px-6 py-5 whitespace-nowrap text-sm text-content-primary">
                    {(user.storage_used_bytes / 1024 / 1024).toFixed(2)} MB
                  </td>
                  <td className="px-6 py-5 whitespace-nowrap text-sm">
                    <StatusBadge status={user.is_active ? 'active' : 'inactive'} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* ══════════════════════════════════════════════════
          TAB: 시스템 로그
         ══════════════════════════════════════════════════ */}
      {activeTab === 'logs' && !logsLoading && (
        <section className="overflow-hidden rounded-3xl border border-white/[0.07] bg-surface">
          <table className="min-w-full divide-y divide-white/[0.07]">
            <thead className="bg-surface-raised">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">
                  시간
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">
                  레벨
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">
                  서비스
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">
                  이벤트
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">
                  메시지
                </th>
              </tr>
            </thead>
            <tbody className="bg-surface divide-y divide-white/[0.07]">
              {logsData?.logs.slice(0, 20).map((log) => (
                <tr key={log.id} className="align-top transition-colors hover:bg-surface-deep/50">
                  <td className="px-6 py-5 whitespace-nowrap text-sm text-content-secondary">
                    {formatDateTime(log.created_at)}
                  </td>
                  <td className="px-6 py-5 whitespace-nowrap text-sm">
                    <StatusBadge status={log.level} />
                  </td>
                  <td className="px-6 py-5 whitespace-nowrap text-sm font-medium text-content-primary">
                    {log.service_name}
                  </td>
                  <td className="px-6 py-5 whitespace-nowrap text-sm text-content-primary">
                    {log.event_type}
                  </td>
                  <td className="max-w-md px-6 py-5 text-sm text-content-secondary">
                    {log.message}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* ══════════════════════════════════════════════════
          TAB: 모델 사용량
         ══════════════════════════════════════════════════ */}
      {activeTab === 'models' && !modelLoading && (
        <section className="rounded-3xl border border-white/[0.07] bg-surface p-6 md:p-7">
          <h2 className="text-xl font-semibold text-content-primary">모델 사용량</h2>
          <p className="mt-2 text-sm leading-6 text-content-secondary">요청 수와 토큰 사용량을 함께 보면서 운영 부담을 차분하게 확인할 수 있습니다.</p>
          {modelData?.usage.map((model) => (
            <div key={model.model_name} className="mt-5 rounded-2xl border border-white/[0.07] bg-surface-deep px-5 py-5 first:mt-6">
              <div className="text-lg font-semibold text-content-primary">{model.model_name}</div>
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4 text-sm">
                <div className="rounded-xl border border-white/[0.07] bg-surface px-4 py-3">
                  <div className="text-content-secondary">요청 수</div>
                  <div className="text-content-primary font-medium">{model.request_count}</div>
                </div>
                <div className="rounded-xl border border-white/[0.07] bg-surface px-4 py-3">
                  <div className="text-content-secondary">입력 토큰</div>
                  <div className="text-content-primary font-medium">{model.input_tokens}</div>
                </div>
                <div className="rounded-xl border border-white/[0.07] bg-surface px-4 py-3">
                  <div className="text-content-secondary">출력 토큰</div>
                  <div className="text-content-primary font-medium">{model.output_tokens}</div>
                </div>
                <div className="rounded-xl border border-white/[0.07] bg-surface px-4 py-3">
                  <div className="text-content-secondary">실패 건수</div>
                  <div className="text-content-primary font-medium">{model.failure_count}</div>
                </div>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* ══════════════════════════════════════════════════
          TAB: 감사 로그
         ══════════════════════════════════════════════════ */}
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
            <tbody className="bg-surface divide-y divide-white/[0.07]">
              {auditData?.logs.map((log) => (
                <tr key={log.id} className="align-top transition-colors hover:bg-surface-deep/50">
                  <td className="px-6 py-5 whitespace-nowrap text-sm text-content-secondary">
                    {formatDateTime(log.created_at)}
                  </td>
                  <td className="px-6 py-5 whitespace-nowrap text-sm font-medium text-content-primary">
                    {log.admin_user_id.slice(0, 8)}…
                  </td>
                  <td className="px-6 py-5 whitespace-nowrap text-sm text-content-primary">
                    {log.target_user_id ? `${log.target_user_id.slice(0, 8)}…` : '—'}
                  </td>
                  <td className="px-6 py-5 whitespace-nowrap text-sm text-content-primary">
                    {log.action_type}
                  </td>
                  <td className="px-6 py-5 whitespace-nowrap text-sm text-content-secondary">
                    {log.target_type ?? '—'}
                  </td>
                  <td className="px-6 py-5 whitespace-nowrap text-sm text-content-secondary">
                    {log.ip_address ?? '—'}
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
            <span className="text-sm text-content-secondary">
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

      {/* ══════════════════════════════════════════════════
          TAB: 공지 관리
         ══════════════════════════════════════════════════ */}
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
              <tbody className="bg-surface divide-y divide-white/[0.07]">
                {announcementsData?.map((ann) => (
                  <tr key={ann.id} className="align-top transition-colors hover:bg-surface-deep/50">
                    <td className="px-6 py-5 whitespace-nowrap text-sm font-medium text-content-primary">{ann.title}</td>
                    <td className="max-w-xs px-6 py-5 text-sm text-content-secondary truncate">
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
                  className="mt-2 w-full rounded-2xl border border-white/[0.07] bg-surface-deep px-4 py-3 text-sm text-content-primary placeholder-content-muted resize-none"
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

      {/* ══════════════════════════════════════════════════
          TAB: 가장 모드
         ══════════════════════════════════════════════════ */}
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
                <tbody className="bg-surface divide-y divide-white/[0.07]">
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

      {/* ══════════════════════════════════════════════════
          TAB: 모델 설정
         ══════════════════════════════════════════════════ */}
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
