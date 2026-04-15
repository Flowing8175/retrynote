import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { CreditCard } from 'lucide-react';
import { authApi } from '@/api';
import { billingApi } from '@/api/billing';
import { Modal } from '@/components';
import { useTour } from '@/components/OnboardingTour';
import { useAuthStore } from '@/stores';
import { useUsageStatus } from '@/lib/useUsageStatus';
import { useModalState } from '@/hooks/useModalState';

const TIER_LABELS: Record<string, string> = {
  free: 'Free',
  lite: 'Lite',
  standard: 'Standard',
  pro: 'Pro',
};

const TIER_BADGE: Record<string, string> = {
  free: 'bg-surface text-content-muted border border-white/[0.08]',
  lite: 'bg-brand-500/15 text-brand-300 border border-brand-500/30',
  standard: 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30',
  pro: 'bg-purple-500/15 text-purple-300 border border-purple-500/30',
};

const STATUS_LABELS: Record<string, string> = {
  active: '활성',
  past_due: '연체',
  canceled: '취소됨',
  trialing: '체험 중',
};

const STATUS_BADGE: Record<string, string> = {
  active:
    'bg-semantic-success-bg text-semantic-success border border-semantic-success-border',
  past_due:
    'bg-semantic-warning-bg text-semantic-warning border border-semantic-warning-border',
  canceled:
    'bg-semantic-error-bg text-semantic-error border border-semantic-error-border',
  trialing: 'bg-brand-500/10 text-brand-300 border border-brand-500/20',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}년 ${m}월 ${day}일`;
}

export default function Settings() {
  const { user, logout } = useAuthStore();
  const queryClient = useQueryClient();
  const { data: usageStatus } = useUsageStatus();
  const { restartTour } = useTour();
  const deleteModal = useModalState();
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [cancelDone, setCancelDone] = useState(false);
  const [updatingPayment, setUpdatingPayment] = useState(false);

  const { data: subscription } = useQuery({
    queryKey: ['subscription'],
    queryFn: billingApi.getSubscription,
    staleTime: 60_000,
  });

  const deleteMutation = useMutation({
    mutationFn: () => authApi.deleteAccount({ password }),
    onSuccess: () => {
      logout();
    },
    onError: (error: AxiosError<{ detail: string }>) => {
      setErrorMessage(error.response?.data?.detail ?? '계정 삭제 중 오류가 발생했습니다.');
    },
  });

  async function handleUpdatePayment() {
    setUpdatingPayment(true);
    try {
      const result = await billingApi.getManageUrls();
      if (result.updatePaymentMethodUrl) {
        window.location.href = result.updatePaymentMethodUrl;
      }
    } finally {
      setUpdatingPayment(false);
    }
  }

  async function handleCancelSubscription() {
    setCanceling(true);
    try {
      await billingApi.cancelSubscription();
      setCancelDone(true);
      setCancelConfirm(false);
      queryClient.invalidateQueries({ queryKey: ['subscription'] });
      queryClient.invalidateQueries({ queryKey: ['usageStatus'] });
    } finally {
      setCanceling(false);
    }
  }

  function openDeleteModal() {
    setPassword('');
    setErrorMessage(null);
    deleteModal.open();
  }

  function closeDeleteModal() {
    if (deleteMutation.isPending) return;
    deleteModal.close();
    setPassword('');
    setErrorMessage(null);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-bold text-content-primary">계정 설정</h1>
      </div>

       {/* Account Info */}
       <div className="rounded-2xl border border-white/[0.08] bg-surface p-6 space-y-4" data-tour="settings-account">
        <h2 className="text-base font-semibold text-content-primary">계정 정보</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-content-muted">이메일</span>
            <span className="text-sm text-content-primary">{user?.email}</span>
          </div>
          <div className="border-t border-white/[0.05]" />
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-content-muted">사용자 이름</span>
            <span className="text-sm text-content-primary">{user?.username || '—'}</span>
          </div>
          <div className="border-t border-white/[0.05]" />
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-content-muted">현재 요금제</span>
            <span className="text-sm font-medium text-brand-300">{(usageStatus?.tier ?? 'free').charAt(0).toUpperCase() + (usageStatus?.tier ?? 'free').slice(1)}</span>
          </div>
           {user?.created_at && (
             <>
               <div className="border-t border-white/[0.05]" />
               <div className="flex items-center justify-between py-2">
                 <span className="text-sm text-content-muted">가입일</span>
                 <span className="text-sm text-content-primary">{new Date(user.created_at).toLocaleDateString('ko-KR')}</span>
               </div>
             </>
           )}
         </div>
         <div className="border-t border-white/[0.05]" />
         <button
           type="button"
           onClick={restartTour}
           className="mt-4 inline-flex items-center rounded-xl border border-white/[0.07] px-4 py-2.5 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-hover"
         >
           투어 다시 보기
         </button>
       </div>

      {/* Password */}
      <div className="rounded-2xl border border-white/[0.08] bg-surface p-6 space-y-4">
        <h2 className="text-base font-semibold text-content-primary">비밀번호</h2>
        <p className="text-sm text-content-secondary">비밀번호를 변경하려면 재설정 링크를 이용하세요.</p>
        <Link
          to="/password-reset"
          className="inline-flex items-center rounded-xl border border-white/[0.07] px-4 py-2.5 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-hover"
        >
          비밀번호 변경
        </Link>
      </div>

      {/* Subscription Management */}
      <div className="rounded-2xl border border-white/[0.08] bg-surface p-6 space-y-4">
        <h2 className="text-base font-semibold text-content-primary">구독 관리</h2>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${TIER_BADGE[usageStatus?.tier ?? 'free'] ?? TIER_BADGE.free}`}
          >
            {TIER_LABELS[usageStatus?.tier ?? 'free'] ?? 'Free'}
          </span>
          {subscription ? (
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${STATUS_BADGE[subscription.status] ?? ''}`}
            >
              {STATUS_LABELS[subscription.status] ?? subscription.status}
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium bg-surface text-content-muted border border-white/[0.08]">
              무료 플랜
            </span>
          )}
        </div>

        {subscription?.currentPeriodEnd && (
          <p className="text-sm text-content-secondary">
            다음 갱신일:{' '}
            <span className="font-medium text-content-primary">
              {formatDate(subscription.currentPeriodEnd)}
            </span>
          </p>
        )}
        {subscription?.billingCycle && (
          <p className="text-xs text-content-muted">
            {subscription.billingCycle === 'monthly' ? '월간 구독' : '분기 구독'}
          </p>
        )}

        {subscription && (
          <>
            <div className="border-t border-white/[0.05]" />
            {cancelDone ? (
              <p className="text-sm text-semantic-success">
                구독 취소가 예약되었습니다. 현재 결제 기간 종료 시 만료됩니다.
              </p>
            ) : (
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleUpdatePayment}
                  disabled={updatingPayment}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-content-inverse transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <CreditCard size={16} />
                  {updatingPayment ? '이동 중…' : '결제 수단 변경'}
                </button>
                {!cancelConfirm ? (
                  <button
                    type="button"
                    onClick={() => setCancelConfirm(true)}
                    className="inline-flex items-center gap-2 rounded-xl border border-semantic-error/40 px-5 py-2.5 text-sm font-medium text-semantic-error transition-colors hover:bg-semantic-error/10"
                  >
                    구독 취소
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-content-secondary">정말 취소하시겠습니까?</p>
                    <button
                      type="button"
                      onClick={handleCancelSubscription}
                      disabled={canceling}
                      className="rounded-xl bg-semantic-error px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                    >
                      {canceling ? '처리 중…' : '취소 확인'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setCancelConfirm(false)}
                      className="rounded-xl border border-white/[0.08] px-4 py-2 text-sm font-medium text-content-secondary transition-colors hover:text-content-primary"
                    >
                      돌아가기
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {!subscription && (
          <>
            <div className="border-t border-white/[0.05]" />
            <Link
              to="/pricing"
              className="inline-flex items-center rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-content-inverse transition-opacity hover:opacity-90"
            >
              요금제 둘러보기
            </Link>
          </>
        )}
      </div>

      <div className="rounded-2xl border border-semantic-error/60 bg-semantic-error-bg p-6">
        <h2 className="text-base font-semibold text-semantic-error">위험 구역</h2>
        <p className="mt-2 text-sm leading-6 text-content-secondary">
          계정을 삭제하면 모든 자료, 퀴즈, 오답 데이터가 영구적으로 사라집니다. 이 작업은 되돌릴 수 없습니다.
        </p>
        <button
          type="button"
          onClick={openDeleteModal}
          className="mt-4 inline-flex items-center rounded-xl border border-semantic-error/60 px-4 py-2.5 text-sm font-medium text-semantic-error transition-colors hover:bg-semantic-error hover:text-white"
        >
          계정 삭제
        </button>
      </div>

      <Modal isOpen={deleteModal.isOpen} onClose={closeDeleteModal} title="계정을 삭제할까요?">
        <div className="space-y-5">
          <p className="text-sm leading-6 text-content-secondary">
            모든 자료, 퀴즈, 오답 데이터가 영구적으로 삭제됩니다. 계속하려면 비밀번호를 입력하세요.
          </p>

          <div className="space-y-1.5">
            <label htmlFor="delete-password" className="block text-sm font-medium text-content-primary">
              비밀번호
            </label>
            <input
              id="delete-password"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setErrorMessage(null);
              }}
              placeholder="현재 비밀번호 입력"
              className="w-full rounded-xl border border-white/[0.07] bg-surface-deep px-4 py-2.5 text-sm text-content-primary placeholder:text-content-muted focus:border-brand-500 focus:outline-none"
            />
            {errorMessage && (
              <p className="text-xs text-semantic-error">{errorMessage}</p>
            )}
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={closeDeleteModal}
              disabled={deleteMutation.isPending}
              className="rounded-xl border border-white/[0.07] px-4 py-2.5 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-hover disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="button"
              disabled={deleteMutation.isPending || password.length === 0}
              onClick={() => deleteMutation.mutate()}
              className="rounded-xl bg-semantic-error px-4 py-2.5 text-sm font-medium text-content-inverse transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deleteMutation.isPending ? '삭제 중…' : '계정 삭제'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
