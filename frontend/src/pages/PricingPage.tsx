import { useState } from 'react';
import { Link } from 'react-router-dom';
import { billingApi } from '@/api/billing';
import { useAuthStore } from '@/stores/authStore';
import type { BillingCycle, UserTier } from '@/types/billing';

interface TierMeta {
  name: string;
  monthlyPrice: string;
  quarterlyPrice: string;
  priceSuffix: { monthly: string; quarterly: string };
}

const TIER_META: Record<UserTier, TierMeta> = {
  free: {
    name: 'Free',
    monthlyPrice: '₩0',
    quarterlyPrice: '₩0',
    priceSuffix: { monthly: '', quarterly: '' },
  },
  learner: {
    name: 'Learner Lite',
    monthlyPrice: '₩9,900',
    quarterlyPrice: '₩25,300',
    priceSuffix: { monthly: '/월', quarterly: '/분기' },
  },
  pro: {
    name: 'Learner Pro',
    monthlyPrice: '₩22,000',
    quarterlyPrice: '₩56,100',
    priceSuffix: { monthly: '/월', quarterly: '/분기' },
  },
};

interface FeatureRow {
  label: string;
  free: string;
  learner: string;
  pro: string;
}

const FEATURES: FeatureRow[] = [
  { label: '저장 공간', free: '100 MB', learner: '5,000 MB', pro: '무제한' },
  { label: '퀴즈 생성 (8시간)', free: '3회', learner: '100회', pro: '무제한' },
  { label: 'OCR 페이지 (8시간)', free: '1페이지', learner: '50페이지', pro: '무제한' },
  { label: 'AI 모델', free: 'ECO만', learner: '전체', pro: '전체' },
  { label: '고급 모델 무료 체험', free: '주 1회', learner: '—', pro: '—' },
];

interface CreditPack {
  label: string;
  price: string;
  type: string;
  size: string;
}

const CREDIT_PACKS: CreditPack[] = [
  { label: '+5GB 저장공간', price: '₩3,300', type: 'storage', size: '5gb' },
  { label: '+20GB 저장공간', price: '₩9,900', type: 'storage', size: '20gb' },
  { label: '+퀴즈 100회', price: '₩4,400', type: 'ai', size: '100' },
  { label: '+퀴즈 500회', price: '₩18,700', type: 'ai', size: '500' },
];

const TIERS: UserTier[] = ['free', 'learner', 'pro'];

export default function PricingPage() {
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [loadingTier, setLoadingTier] = useState<'learner' | 'pro' | null>(null);
  const [loadingCredit, setLoadingCredit] = useState<string | null>(null);

  const user = useAuthStore((s) => s.user);
  const usageStatus = useAuthStore((s) => s.usageStatus);

  const currentTier: UserTier | null = user ? (usageStatus?.tier ?? 'free') : null;

  async function handleSubscribe(tier: 'learner' | 'pro') {
    setLoadingTier(tier);
    try {
      const result = await billingApi.checkoutSubscription(tier, billingCycle);
      window.location.href = result.sessionUrl;
    } catch {
      setLoadingTier(null);
    }
  }

  async function handleCreditPurchase(creditType: string, packSize: string, key: string) {
    setLoadingCredit(key);
    try {
      const result = await billingApi.checkoutCredits(creditType, packSize);
      window.location.href = result.sessionUrl;
    } catch {
      setLoadingCredit(null);
    }
  }

  function renderTierCta(tier: UserTier) {
    if (currentTier === tier) {
      return (
        <button
          disabled
          className="w-full cursor-default rounded-xl border border-white/[0.07] py-2.5 text-sm font-medium text-content-muted"
        >
          현재 요금제
        </button>
      );
    }

    if (tier === 'free') {
      return (
        <Link
          to="/signup"
          className="block w-full rounded-xl border border-brand-500/60 py-2.5 text-center text-sm font-medium text-brand-400 transition-colors hover:bg-brand-500/10"
        >
          무료 시작
        </Link>
      );
    }

    const paidTier = tier as 'learner' | 'pro';
    const isLoading = loadingTier === paidTier;
    return (
      <button
        onClick={() => handleSubscribe(paidTier)}
        disabled={isLoading}
        className="w-full rounded-xl bg-brand-500 py-2.5 text-sm font-semibold text-content-inverse transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isLoading ? '처리 중…' : `${TIER_META[tier].name} 시작하기`}
      </button>
    );
  }

  const currentPrice = (tier: UserTier) =>
    billingCycle === 'monthly'
      ? TIER_META[tier].monthlyPrice
      : TIER_META[tier].quarterlyPrice;

  const currentSuffix = (tier: UserTier) => TIER_META[tier].priceSuffix[billingCycle];

  return (
    <div className="min-h-screen bg-surface-deep px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">

        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-300">요금제</p>
          <h1 className="mt-3 text-[clamp(1.8rem,4vw,2.8rem)] font-semibold tracking-tight text-content-primary">
            학습 목표에 맞는 요금제를 선택하세요
          </h1>
          <p className="mt-4 text-base text-content-secondary">
            언제든지 업그레이드하거나 취소할 수 있습니다.
          </p>
        </div>

        <div className="mt-10 flex items-center justify-center gap-3">
          <div className="flex rounded-xl border border-white/[0.07] bg-surface p-1">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`rounded-lg px-5 py-2 text-sm font-medium transition-colors ${
                billingCycle === 'monthly'
                  ? 'bg-brand-500 text-content-inverse'
                  : 'text-content-secondary hover:text-content-primary'
              }`}
            >
              월간
            </button>
            <button
              onClick={() => setBillingCycle('quarterly')}
              className={`rounded-lg px-5 py-2 text-sm font-medium transition-colors ${
                billingCycle === 'quarterly'
                  ? 'bg-brand-500 text-content-inverse'
                  : 'text-content-secondary hover:text-content-primary'
              }`}
            >
              분기
            </button>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              billingCycle === 'quarterly'
                ? 'bg-semantic-success/20 text-semantic-success'
                : 'border border-white/[0.07] bg-surface text-content-muted'
            }`}
          >
            15% 할인
          </span>
        </div>

        <div className="mt-10 overflow-x-auto">
          <div className="min-w-[600px] overflow-hidden rounded-2xl border border-white/[0.07]">
            <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr] bg-surface">
              <div className="border-b border-r border-white/[0.07] px-6 py-5" />
              {TIERS.map((tier, i) => (
                <div
                  key={tier}
                  className={[
                    'border-b border-white/[0.07] px-5 py-5',
                    i < TIERS.length - 1 ? 'border-r' : '',
                    currentTier === tier ? 'bg-brand-500/[0.06]' : '',
                  ].join(' ')}
                >
                  <p className="text-[0.72rem] font-bold uppercase tracking-widest text-content-muted">
                    {TIER_META[tier].name}
                  </p>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-2xl font-semibold text-content-primary">
                      {currentPrice(tier)}
                    </span>
                    {currentSuffix(tier) && (
                      <span className="text-xs text-content-muted">{currentSuffix(tier)}</span>
                    )}
                  </div>
                  <div className="mt-4">{renderTierCta(tier)}</div>
                </div>
              ))}
            </div>

            {FEATURES.map((feature, rowIdx) => (
              <div
                key={feature.label}
                className={`grid grid-cols-[1.4fr_1fr_1fr_1fr] ${
                  rowIdx < FEATURES.length - 1 ? 'border-b border-white/[0.07]' : ''
                }`}
              >
                <div className="border-r border-white/[0.07] bg-surface-deep/30 px-6 py-4 text-sm font-medium text-content-secondary">
                  {feature.label}
                </div>
                {TIERS.map((tier, i) => (
                  <div
                    key={tier}
                    className={[
                      'px-5 py-4 text-center text-sm text-content-primary',
                      i < TIERS.length - 1 ? 'border-r border-white/[0.07]' : '',
                      currentTier === tier ? 'bg-brand-500/[0.06]' : '',
                    ].join(' ')}
                  >
                    {feature[tier]}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-16">
          <h2 className="text-xl font-semibold text-content-primary">크레딧 추가 구매</h2>
          <p className="mt-1 text-sm text-content-secondary">
            구독보다 단가가 높지만 필요할 때 사용 가능합니다
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {CREDIT_PACKS.map((pack) => {
              const key = `${pack.type}-${pack.size}`;
              const isLoading = loadingCredit === key;
              return (
                <div
                  key={key}
                  className="flex flex-col gap-4 rounded-2xl border border-white/[0.07] bg-surface p-5"
                >
                  <div>
                    <p className="text-sm font-semibold text-content-primary">{pack.label}</p>
                    <p className="mt-1 text-lg font-semibold text-brand-400">{pack.price}</p>
                  </div>
                  <button
                    onClick={() => handleCreditPurchase(pack.type, pack.size, key)}
                    disabled={isLoading}
                    className="mt-auto rounded-xl border border-brand-500/50 py-2 text-sm font-medium text-brand-400 transition-colors hover:bg-brand-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isLoading ? '처리 중…' : '구매'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
