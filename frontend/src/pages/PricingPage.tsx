import { useState } from 'react';
import { Link } from 'react-router-dom';
import { billingApi } from '@/api/billing';
import { useAuthStore } from '@/stores/authStore';
import type { BillingCycle, UserTier } from '@/types/billing';

interface TierMeta {
  name: string;
  description: string;
  monthlyPrice: string;
  quarterlyPrice: string;
  priceSuffix: { monthly: string; quarterly: string };
  highlight?: boolean;
}

const TIER_META: Record<UserTier, TierMeta> = {
  free: {
    name: 'Free',
    description: '체험해 보세요',
    monthlyPrice: '₩0',
    quarterlyPrice: '₩0',
    priceSuffix: { monthly: '', quarterly: '' },
  },
  lite: {
    name: 'Lite',
    description: '가벼운 학습용',
    monthlyPrice: '₩6,900',
    quarterlyPrice: '₩17,600',
    priceSuffix: { monthly: '/월', quarterly: '/분기' },
  },
  standard: {
    name: 'Standard',
    description: '본격적인 시험 준비',
    monthlyPrice: '₩14,900',
    quarterlyPrice: '₩38,100',
    priceSuffix: { monthly: '/월', quarterly: '/분기' },
    highlight: true,
  },
  pro: {
    name: 'Pro',
    description: '대량 학습 · 팀 사용',
    monthlyPrice: '₩26,900',
    quarterlyPrice: '₩68,600',
    priceSuffix: { monthly: '/월', quarterly: '/분기' },
  },
};

interface FeatureRow {
  label: string;
  free: string;
  lite: string;
  standard: string;
  pro: string;
}

const FEATURES: FeatureRow[] = [
  { label: '저장 공간', free: '150 MB', lite: '3 GB', standard: '15 GB', pro: '50 GB' },
  { label: '크레딧 (30일)', free: '5c', lite: '60c', standard: '200c', pro: '700c' },
  { label: 'OCR 페이지 (30일)', free: '5페이지', lite: '100페이지', standard: '500페이지', pro: '2,000페이지' },
  { label: '파일 크기 제한', free: '5 MB', lite: '50 MB', standard: '100 MB', pro: '200 MB' },
];

interface CreditPack {
  label: string;
  price: string;
  unitPrice: string;
  type: string;
  size: string;
}

const CREDIT_PACKS: CreditPack[] = [
  { label: '+5GB 저장공간', price: '₩3,900', unitPrice: '₩780/GB', type: 'storage', size: '5gb' },
  { label: '+20GB 저장공간', price: '₩12,900', unitPrice: '₩645/GB', type: 'storage', size: '20gb' },
  { label: '+50GB 저장공간', price: '₩27,900', unitPrice: '₩558/GB', type: 'storage', size: '50gb' },
];

const TIERS: UserTier[] = ['free', 'lite', 'standard', 'pro'];

export default function PricingPage() {
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [loadingTier, setLoadingTier] = useState<'lite' | 'standard' | 'pro' | null>(null);
  const [loadingCredit, setLoadingCredit] = useState<string | null>(null);

  const user = useAuthStore((s) => s.user);
  const usageStatus = useAuthStore((s) => s.usageStatus);

  const currentTier: UserTier | null = user ? (usageStatus?.tier ?? 'free') : null;

  async function handleSubscribe(tier: 'lite' | 'standard' | 'pro') {
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
      if (currentTier === null) {
        return (
          <Link
            to="/signup"
            className="block w-full rounded-xl border border-brand-500/60 py-2.5 text-center text-sm font-medium text-brand-400 transition-colors hover:bg-brand-500/10"
          >
            시작하기
          </Link>
        );
      }
      return (
        <button
          disabled
          className="w-full cursor-default rounded-xl border border-white/[0.07] py-2.5 text-sm font-medium text-content-muted"
        >
          다운그레이드
        </button>
      );
    }

    const paidTier = tier as 'lite' | 'standard' | 'pro';
    const isLoading = loadingTier === paidTier;
    const isHighlight = TIER_META[tier].highlight;
    return (
      <button
        onClick={() => handleSubscribe(paidTier)}
        disabled={isLoading}
        className={`w-full rounded-xl py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
          isHighlight
            ? 'bg-brand-500 text-content-inverse hover:bg-brand-600'
            : 'border border-brand-500/60 text-brand-400 hover:bg-brand-500/10'
        }`}
      >
        {isLoading ? '처리 중…' : '시작하기'}
      </button>
    );
  }

  const currentPrice = (tier: UserTier) =>
    billingCycle === 'monthly' ? TIER_META[tier].monthlyPrice : TIER_META[tier].quarterlyPrice;

  const currentSuffix = (tier: UserTier) => TIER_META[tier].priceSuffix[billingCycle];

  return (
    <div className="mx-auto max-w-6xl">

      <div className="text-center">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-300">요금제</p>
        <h1
          className="mt-3 font-semibold tracking-tight text-content-primary"
          style={{ fontSize: 'clamp(1.5rem, 4vw, 2.5rem)' }}
        >
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
        <div className="min-w-[700px] overflow-hidden rounded-2xl border border-white/[0.07]">
          {/* Header row */}
          <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr_1fr] bg-surface">
            <div className="border-b border-r border-white/[0.07] px-6 py-7" />
            {TIERS.map((tier, i) => {
              const isHighlight = TIER_META[tier].highlight;
              return (
                <div
                  key={tier}
                  className={[
                    'border-b border-white/[0.07] px-5 py-7',
                    i < TIERS.length - 1 ? 'border-r' : '',
                    currentTier === tier ? 'bg-brand-500/[0.06]' : '',
                    isHighlight ? 'relative bg-brand-500/[0.09]' : '',
                    tier === 'free' && currentTier !== 'free' ? 'opacity-60' : '',
                  ].join(' ')}
                  style={
                    isHighlight
                      ? {
                          boxShadow: '0 0 28px -6px oklch(0.65 0.15 175 / 0.35)',
                          borderTop: '2px solid oklch(0.65 0.15 175 / 0.6)',
                        }
                      : undefined
                  }
                >
                  {isHighlight && (
                    <span className="mb-2.5 inline-flex items-center rounded-full bg-semantic-success-bg px-2.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-widest text-semantic-success">
                      추천
                    </span>
                  )}
                  <p className="text-[0.72rem] font-bold uppercase tracking-widest text-content-muted">
                    {TIER_META[tier].name}
                  </p>
                  <p className="mt-1 text-[0.65rem] text-content-muted">{TIER_META[tier].description}</p>
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
              );
            })}
          </div>

          {FEATURES.map((feature, rowIdx) => (
            <div
              key={feature.label}
              className={`grid grid-cols-[1.4fr_1fr_1fr_1fr_1fr] ${
                rowIdx < FEATURES.length - 1 ? 'border-b border-white/[0.07]' : ''
              }`}
              style={
                rowIdx % 2 === 0
                  ? { backgroundColor: 'oklch(0.18 0.01 250)' }
                  : undefined
              }
            >
              <div className="border-r border-white/[0.07] px-6 py-6 text-sm font-medium text-content-secondary">
                {feature.label}
              </div>
              {TIERS.map((tier, i) => (
                <div
                  key={tier}
                  className={[
                    'px-5 py-6 text-center text-sm',
                    tier === 'free' ? 'text-content-muted' : 'text-content-primary',
                    i < TIERS.length - 1 ? 'border-r border-white/[0.07]' : '',
                    currentTier === tier ? 'bg-brand-500/[0.06]' : '',
                    TIER_META[tier].highlight ? 'bg-brand-500/[0.07]' : '',
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
          구독 용량이 부족할 때 저장 공간을 영구적으로 추가할 수 있습니다.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {CREDIT_PACKS.map((pack) => {
            const key = `${pack.type}-${pack.size}`;
            const isLoading = loadingCredit === key;
            return (
              <div
                key={key}
                className="flex flex-col gap-4 rounded-2xl border border-white/[0.08] bg-surface p-6"
                style={{ backgroundColor: 'oklch(0.20 0.01 250)' }}
              >
                <div>
                  {pack.size === '20gb' && (
                    <span className="text-[0.6rem] font-bold uppercase tracking-widest text-semantic-success">인기</span>
                  )}
                  <p className="text-sm font-semibold text-content-primary">{pack.label}</p>
                  <p className="mt-1 text-lg font-semibold text-brand-300">{pack.price}</p>
                  <p className="mt-0.5 text-xs text-content-muted">{pack.unitPrice}</p>
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
  );
}
