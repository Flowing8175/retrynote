import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/api';
import { LoadingSpinner } from '@/components';
import { useAuthStore } from '@/stores/authStore';
import type { AnnouncementCreate, ModelSettingsUpdate } from '@/types';
import {
  AdminLoginGate,
  AdminDashboardHeader,
  AdminHealthTab,
  AdminUsersTab,
  AdminLogsTab,
  AdminModelsTab,
  AdminAuditTab,
  AdminAnnouncementsTab,
  AdminImpersonationTab,
  AdminModelSettingsTab,
  AdminKPIsPanel,
  AdminJobsTab,
  AdminDbTab,
  AdminFilesTab,
  tabs,
} from '@/components/admin';
import type { TabKey } from '@/components/admin';

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
      <AdminLoginGate
        masterPassword={masterPassword}
        setMasterPassword={setMasterPassword}
        verifyError={verifyError}
        setVerifyError={setVerifyError}
        verifyMutation={verifyMutation}
      />
    );
  }

  const usersCount = healthData?.stats.total_users ?? usersData?.users.length ?? 0;
  const activeUsers = healthData?.stats.active_users ?? usersData?.users.filter((u) => u.is_active).length ?? 0;
  const errors24h = healthData?.stats.errors_24h ?? 0;
  const errorRatePct = healthData?.stats.error_rate_pct ?? 0;
  const auditTotalPages = auditData ? Math.max(1, Math.ceil(auditData.total / 20)) : 1;

  return (
    <div className="space-y-6">
      <AdminDashboardHeader
        usersCount={usersCount}
        activeUsers={activeUsers}
        errors24h={errors24h}
        errorRatePct={errorRatePct}
      />

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
        <AdminHealthTab healthData={healthData} refetchHealth={refetchHealth} />
      )}

      {activeTab === 'health' && (
        <AdminKPIsPanel isVerified={isVerified} />
      )}

      {activeTab === 'users' && !usersLoading && (
        <AdminUsersTab usersData={usersData} />
      )}

      {activeTab === 'logs' && !logsLoading && (
        <AdminLogsTab
          logsData={logsData}
          logLevelFilter={logLevelFilter}
          setLogLevelFilter={setLogLevelFilter}
        />
      )}

      {activeTab === 'models' && !modelLoading && (
        <AdminModelsTab modelData={modelData} />
      )}

      {activeTab === 'audit' && !auditLoading && (
        <AdminAuditTab
          auditData={auditData}
          auditPage={auditPage}
          setAuditPage={setAuditPage}
          auditTotalPages={auditTotalPages}
        />
      )}

      {activeTab === 'announcements' && !announcementsLoading && (
        <AdminAnnouncementsTab
          announcementsData={announcementsData}
          announcementForm={announcementForm}
          setAnnouncementForm={setAnnouncementForm}
          createAnnouncementMutation={createAnnouncementMutation}
        />
      )}

      {activeTab === 'impersonation' && (
        <AdminImpersonationTab
          usersData={usersData}
          usersLoading={usersLoading}
          impersonationId={impersonationId}
          impersonatingTarget={impersonatingTarget}
          startImpersonationMutation={startImpersonationMutation}
          endImpersonationMutation={endImpersonationMutation}
        />
      )}

      {activeTab === 'model_settings' && (
        <AdminModelSettingsTab
          modelForm={modelForm}
          setModelForm={setModelForm}
          modelSaveMsg={modelSaveMsg}
          updateModelSettingsMutation={updateModelSettingsMutation}
        />
      )}

      {activeTab === 'jobs' && (
        <AdminJobsTab isVerified={isVerified} activeTab={activeTab} />
      )}

      {activeTab === 'db' && (
        <AdminDbTab isVerified={isVerified} activeTab={activeTab} />
      )}

      {activeTab === 'files' && (
        <AdminFilesTab isVerified={isVerified} activeTab={activeTab} />
      )}
    </div>
  );
}
