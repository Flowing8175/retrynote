import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X, CreditCard, HardDrive, CheckCircle, Zap } from 'lucide-react';
import { billingApi } from '@/api/billing';
import { openPaddleCheckout } from '@/lib/paddle';
import { useUsageStatus } from '@/lib/useUsageStatus';
import { useAuthStore } from '@/stores/authStore';
import type { ResourceType } from '@/types/billing';

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}GB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}년 ${m}월 ${day}일`;
}

function formatWindowTime(iso: string): string {
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${min}`;
}

function formatExpiryDate(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}.${m}.${day}`;
}

const RESOURCE_LABELS: Record<ResourceType, string> = {
  quiz: '크레딧',
  ocr: 'OCR 처리',
  storage: '저장소',
};

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

interface CreditPack {
  label: string;
  description: string;
  creditType: string;
  packSize: string;
  icon: React.ReactNode;
  popular?: boolean;
}

const CREDIT_PACKS: CreditPack[] = [
  {
    label: '+5GB 저장소',
    description: '₩3,900 · ₩780/GB · 영구',
    creditType: 'storage',
    packSize: '5gb',
    icon: <HardDrive size={16} />,
  },
  {
    label: '+20GB 저장소',
    description: '₩12,900 · ₩645/GB · 영구',
    creditType: 'storage',
    packSize: '20gb',
    icon: <HardDrive size={16} />,
  },
  {
    label: '+50GB 저장소',
    description: '₩27,900 · ₩558/GB · 영구',
    creditType: 'storage',
    packSize: '50gb',
    icon: <HardDrive size={16} />,
  },
];

// TODO(billing): set price after Paddle dashboard configuration
const AI_CREDIT_PACKS: CreditPack[] = [
  {
    label: 'AI 50 크레딧',
    description: '₩—',
    creditType: 'ai',
    packSize: '50',
    icon: <Zap size={16} />,
  },
  {
    label: 'AI 200 크레딧',
    description: '₩—',
    creditType: 'ai',
    packSize: '200',
    icon: <Zap size={16} />,
    popular: true,
  },
  {
    label: 'AI 500 크레딧',
    description: '₩—',
    creditType: 'ai',
    packSize: '500',
    icon: <Zap size={16} />,
  },
];

function UsageBar({ consumed, limit }: { consumed: number; limit: number }) {
  const pct = limit > 0 ? Math.min((consumed / limit) * 100, 100) : 0;
  const danger = pct >= 90;
  const warning = pct >= 70 && !danger;

  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
      <div
        className={`h-full rounded-full transition-all duration-500 ${
          danger
            ? 'bg-semantic-error'
            : warning
              ? 'bg-semantic-warning'
              : 'bg-brand-500'
        }`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function SectionCard({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-white/[0.06] bg-surface p-6 space-y-5 ${className}`}
    >
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-widest text-content-muted">
      {children}
    </h2>
  );
}

function BillingSkeleton() {
  return (
    <div className="space-y-4 animate-pulse" aria-hidden="true">
      <div className="skeleton h-6 w-40 rounded-lg" />
      <div className="rounded-2xl border border-white/[0.06] bg-surface p-6 space-y-4">
        <div className="skeleton h-3 w-24 rounded" />
        <div className="flex items-center gap-3">
          <div className="skeleton h-6 w-20 rounded-full" />
          <div className="skeleton h-6 w-16 rounded-full" />
        </div>
        <div className="skeleton h-3 w-48 rounded" />
      </div>
      <div className="rounded-2xl border border-white/[0.06] bg-surface p-6 space-y-4">
        <div className="skeleton h-3 w-16 rounded" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-2">
            <div className="flex justify-between">
              <div className="skeleton h-3 w-24 rounded" />
              <div className="skeleton h-3 w-16 rounded" />
            </div>
            <div className="skeleton h-1.5 w-full rounded-full" />
            <div className="skeleton h-2.5 w-28 rounded" />
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-white/[0.06] bg-surface p-6 space-y-4">
        <div className="skeleton h-3 w-20 rounded" />
        <div className="flex gap-4">
          <div className="skeleton h-16 w-36 rounded-xl" />
          <div className="skeleton h-16 w-36 rounded-xl" />
        </div>
      </div>
      <div className="rounded-2xl border border-white/[0.06] bg-surface p-6 space-y-4">
        <div className="skeleton h-3 w-20 rounded" />
        <div className="skeleton h-10 w-32 rounded-xl" />
      </div>
      <div className="rounded-2xl border border-white/[0.06] bg-surface p-6 space-y-4">
        <div className="skeleton h-3 w-24 rounded" />
        <div className="grid gap-3 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton h-16 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function BillingPage() {
  const location = useLocation();
  const queryClient = useQueryClient();

  const searchParams = new URLSearchParams(location.search);
  const isSuccess = searchParams.get('success') === '1';

  const [bannerVisible, setBannerVisible] = useState(isSuccess);
  const [purchasingPack, setPurchasingPack] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [updatingPayment, setUpdatingPayment] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [cancelDone, setCancelDone] = useState(false);

  useEffect(() => {
    if (isSuccess) {
      queryClient.invalidateQueries({ queryKey: ['usageStatus'] });
      queryClient.invalidateQueries({ queryKey: ['subscription'] });
      void useAuthStore.getState().refetchUser();
    }
  }, [isSuccess, queryClient]);

  const invalidateAfterCheckout = useCallback(() => {
    setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ['subscription'] });
      queryClient.invalidateQueries({ queryKey: ['usageStatus'] });
      void useAuthStore.getState().refetchUser();
    }, 2000);
  }, [queryClient]);

  const { data: usageData, isLoading: usageLoading } = useUsageStatus();

  const { data: subscription, isLoading: subLoading } = useQuery({
    queryKey: ['subscription'],
    queryFn: billingApi.getSubscription,
    staleTime: 60_000,
  });

  const isLoading = usageLoading || subLoading;

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
    } finally {
      setCanceling(false);
    }
  }

  async function handlePurchasePack(pack: CreditPack) {
    const key = `${pack.creditType}:${pack.packSize}`;
    setPurchasingPack(key);
    setCheckoutError(null);
    try {
      const result = await billingApi.checkoutCredits(pack.creditType, pack.packSize);
      await openPaddleCheckout(
        result.transactionId,
        () => setPurchasingPack(null),
        invalidateAfterCheckout,
      );
    } catch (err) {
      console.error('[Paddle checkout]', err);
      setCheckoutError('결제 창을 열 수 없습니다. 잠시 후 다시 시도해 주세요.');
      setPurchasingPack(null);
    }
  }

  const tier = usageData?.tier ?? 'free';
  const credits = usageData?.credits;
  const windows = usageData?.windows ?? [];

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8 sm:px-6 animate-fade-in">
      {checkoutError && (
        <div className="rounded-xl border border-semantic-error/30 bg-semantic-error/10 px-4 py-3 text-sm text-semantic-error">
          {checkoutError}
        </div>
      )}

      {bannerVisible && (
        <div className="flex items-start gap-3 rounded-xl border border-brand-500/30 bg-brand-500/10 px-4 py-3 text-sm text-brand-300">
          <CheckCircle size={16} className="mt-0.5 shrink-0 text-brand-400" />
          <p className="flex-1 leading-relaxed">
            결제가 완료되었습니다. 사용량이 업데이트되었습니다.
          </p>
          <button
            type="button"
            onClick={() => setBannerVisible(false)}
            className="shrink-0 text-brand-400 hover:text-brand-300 transition-colors"
            aria-label="닫기"
          >
            <X size={16} />
          </button>
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold text-content-primary">요금제 및 결제</h1>
        <p className="mt-1 text-sm text-content-secondary">
          구독 상태와 사용량을 확인하고 관리하세요.
        </p>
      </div>

      {isLoading ? (
        <BillingSkeleton />
      ) : (
        <div className="space-y-4">
          <SectionCard>
            <SectionTitle>현재 요금제</SectionTitle>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${TIER_BADGE[tier] ?? TIER_BADGE.free}`}
              >
                {TIER_LABELS[tier] ?? tier}
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
          </SectionCard>

          {windows.length > 0 && (
            <SectionCard>
              <SectionTitle>사용량</SectionTitle>
              <div className="space-y-5">
                {windows.map((win) => (
                  <div key={win.resourceType} className="space-y-2">
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm font-medium text-content-primary">
                        {RESOURCE_LABELS[win.resourceType] ?? win.resourceType}
                      </span>
                      <span className="text-xs tabular-nums text-content-muted">
                        {win.resourceType === 'storage'
                          ? `${formatBytes(win.consumed)} / ${formatBytes(win.limit)}`
                          : `${win.consumed.toLocaleString()} / ${win.limit.toLocaleString()}`}
                      </span>
                    </div>
                    <UsageBar consumed={win.consumed} limit={win.limit} />
                    <p className="text-xs text-content-muted">
                      창 만료: {formatWindowTime(win.windowEndsAt)}
                    </p>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {credits && (
            <SectionCard>
              <SectionTitle>크레딧 잔액</SectionTitle>
              <div className="flex flex-wrap gap-3">
                {credits.storageCreditsBytes > 0 && (
                  <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-surface-deep px-4 py-3">
                    <HardDrive size={18} className="text-brand-400 shrink-0" />
                    <div>
                      <p className="text-xs text-content-muted">저장소 크레딧</p>
                      <p className="text-base font-semibold text-content-primary">
                        {formatBytes(credits.storageCreditsBytes)}
                      </p>
                    </div>
                  </div>
                )}
                {credits.aiCreditsBalance > 0 ? (
                  <div
                    data-testid="ai-credits-balance"
                    className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-surface-deep px-4 py-3"
                  >
                    <Zap size={18} className="text-brand-400 shrink-0" />
                    <div>
                      <p className="text-xs text-content-muted">AI 크레딧</p>
                      <p className="text-base font-semibold text-content-primary">
                        {credits.aiCreditsBalance.toFixed(1)} 크레딧
                      </p>
                      {credits.aiCreditsExpiresAt && (
                        <p
                          data-testid="ai-credits-expires-at"
                          className="text-xs text-content-muted"
                        >
                          {formatExpiryDate(credits.aiCreditsExpiresAt)} 만료
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div
                    data-testid="ai-credits-balance"
                    className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-surface-deep px-4 py-3"
                  >
                    <Zap size={18} className="text-content-muted shrink-0" />
                    <div>
                      <p className="text-xs text-content-muted">AI 크레딧</p>
                      <p className="text-sm text-content-muted">없음</p>
                    </div>
                  </div>
                )}
              </div>
            </SectionCard>
          )}

          {subscription && (
            <SectionCard>
              <SectionTitle>구독 관리</SectionTitle>
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
            </SectionCard>
          )}

          <SectionCard>
            <SectionTitle>크레딧 구매</SectionTitle>
            <p className="text-sm text-content-secondary">
              추가 사용량이 필요하면 크레딧을 구매하세요. 구독 용량에 더해집니다.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {CREDIT_PACKS.map((pack) => {
                const key = `${pack.creditType}:${pack.packSize}`;
                const buying = purchasingPack === key;
                return (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-surface-deep p-4"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="shrink-0 text-brand-400">{pack.icon}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-content-primary truncate">
                          {pack.label}
                        </p>
                        <p className="text-xs text-content-muted">{pack.description}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handlePurchasePack(pack)}
                      disabled={buying || purchasingPack !== null}
                      className="shrink-0 rounded-lg border border-brand-500/40 px-3 py-1.5 text-xs font-semibold text-brand-300 transition-colors hover:bg-brand-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {buying ? '…' : '구매'}
                    </button>
                  </div>
                );
              })}
            </div>
          </SectionCard>

          <SectionCard>
            <SectionTitle>AI 크레딧</SectionTitle>
            <p className="text-sm text-content-secondary">
              AI 기능 사용에 필요한 크레딧을 구매하세요. 구독 한도에 더해집니다.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {AI_CREDIT_PACKS.map((pack) => {
                const key = `${pack.creditType}:${pack.packSize}`;
                const buying = purchasingPack === key;
                return (
                  <div
                    key={key}
                    className={`flex items-center justify-between gap-3 rounded-xl border p-4 ${
                      pack.popular
                        ? 'border-brand-500/40 bg-surface-deep'
                        : 'border-white/[0.06] bg-surface-deep'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="shrink-0 text-brand-400">{pack.icon}</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-content-primary truncate">
                            {pack.label}
                          </p>
                          {pack.popular && (
                            <span className="shrink-0 rounded-full bg-brand-500/15 px-2 py-0.5 text-xs font-semibold text-brand-300">
                              인기
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-content-muted">{pack.description}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      data-testid={`ai-credit-pack-${pack.packSize}`}
                      onClick={() => handlePurchasePack(pack)}
                      disabled={buying || purchasingPack !== null}
                      className="shrink-0 rounded-lg border border-brand-500/40 px-3 py-1.5 text-xs font-semibold text-brand-300 transition-colors hover:bg-brand-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {buying ? '…' : '구매'}
                    </button>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        </div>
      )}
    </div>
  );
}
