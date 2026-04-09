import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUsageStatus } from '../lib/useUsageStatus';
import { TIER_DISPLAY } from '../types/billing';
import type { UserTier } from '../types/billing';

interface UsageBarProps {
  expanded?: boolean;
}

const RESOURCE_LABELS: Record<string, string> = {
  quiz: '크레딧',
  ocr: 'OCR 페이지',
  storage: '저장 공간',
};

function getBarColor(pct: number): string {
  if (pct > 90) return 'oklch(0.65 0.18 15)';   // coral
  if (pct > 70) return 'oklch(0.78 0.15 85)';   // amber
  return 'oklch(0.72 0.18 160)';                 // green
}

function formatStorageBytes(bytes: number): string {
  const gb = 1024 * 1024 * 1024;
  return bytes >= gb
    ? `${(bytes / gb).toFixed(1)} GB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getTierBadgeClass(tier: UserTier): string {
  switch (tier) {
    case 'pro':
      return 'text-purple-300 bg-purple-500/10 border-purple-500/20';
    case 'standard':
      return 'text-indigo-300 bg-indigo-500/10 border-indigo-500/20';
    case 'lite':
      return 'text-blue-300 bg-blue-500/10 border-blue-500/20';
    default:
      return 'text-content-muted bg-surface border-white/[0.05]';
  }
}

const CELEBRATION_STYLES = `
  @keyframes tierCelebrate {
    0%   { transform: scale(1);    box-shadow: none; }
    30%  { transform: scale(1.15); box-shadow: 0 0 16px 4px oklch(0.65 0.15 175 / 0.5); }
    70%  { transform: scale(1.05); box-shadow: 0 0 8px 2px oklch(0.65 0.15 175 / 0.25); }
    100% { transform: scale(1);    box-shadow: none; }
  }
  .tier-badge-celebrate {
    animation: tierCelebrate 600ms cubic-bezier(0.25, 1, 0.5, 1) forwards;
  }
  @media (prefers-reduced-motion: reduce) {
    .tier-badge-celebrate { animation: none; }
  }
`;

export default function UsageBar({ expanded = true }: UsageBarProps) {
  const { data, isLoading } = useUsageStatus();
  const [showCelebration, setShowCelebration] = useState(false);

  useEffect(() => {
    const currentTier = data?.tier;
    if (!currentTier) return;

    const lastSeenTier = sessionStorage.getItem('lastSeenTier');
    if (lastSeenTier && currentTier !== lastSeenTier) {
      setShowCelebration(true);
      const timer = setTimeout(() => setShowCelebration(false), 2000);
      sessionStorage.setItem('lastSeenTier', currentTier);
      return () => clearTimeout(timer);
    }
    sessionStorage.setItem('lastSeenTier', currentTier);
  }, [data?.tier]);

  // Collapsed sidebar — just tier initial badge
  if (!expanded) {
    const tier = data?.tier;
    const tierDisplay = tier ? TIER_DISPLAY[tier] : null;
    return (
      <div
        data-testid="usage-bar"
        className="px-2 py-3 border-t border-white/[0.05] flex justify-center"
      >
        {tierDisplay && (
          <span
            className={`inline-flex items-center justify-center w-7 h-7 text-[10px] font-bold rounded-md border ${getTierBadgeClass(tier!)} ${showCelebration ? 'tier-badge-celebrate' : ''}`}
          >
            {tierDisplay.name[0]}
          </span>
        )}
      </div>
    );
  }

  // Loading skeleton
  if (isLoading || !data) {
    return (
      <div data-testid="usage-bar" className="px-3 py-4 border-t border-white/[0.05] space-y-3">
        <div className="flex items-center justify-between">
          <div className="h-5 w-14 bg-surface-hover rounded-md animate-pulse" />
          <div className="h-4 w-12 bg-surface-hover rounded animate-pulse" />
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-1.5">
            <div className="flex justify-between">
              <div className="h-3 w-16 bg-surface-hover rounded animate-pulse" />
              <div className="h-3 w-10 bg-surface-hover rounded animate-pulse" />
            </div>
            <div className="h-1 bg-surface-hover rounded-full animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  const { tier, windows } = data;
  const tierDisplay = TIER_DISPLAY[tier];

  return (
    <div data-testid="usage-bar" className="px-3 py-4 border-t border-white/[0.05] space-y-3">
      {/* CSS keyframes injected once */}
      <style>{CELEBRATION_STYLES}</style>

      {/* Tier badge + upgrade link */}
      <div className="flex items-center justify-between gap-2">
        <span
          className={`inline-flex items-center text-xs font-semibold px-2 py-1 rounded-md border ${getTierBadgeClass(tier)} ${showCelebration ? 'tier-badge-celebrate' : ''}`}
        >
          {tierDisplay.name}
        </span>
        {tier !== 'pro' && (
          <Link
            to="/pricing"
            className="text-xs text-brand-400 hover:text-brand-300 transition-colors font-medium shrink-0"
          >
            업그레이드
          </Link>
        )}
      </div>

      {/* Per-resource usage bars */}
      <div className="space-y-2.5">
        {windows.map((win) => {
          const label = RESOURCE_LABELS[win.resourceType] ?? win.resourceType;
          const isUnlimited = win.limit === -1;
          const pct = isUnlimited
            ? 0
            : Math.min(100, (win.consumed / win.limit) * 100);
          const barColor = getBarColor(pct);

          return (
            <div key={win.resourceType} className="space-y-1">
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs text-content-muted truncate">{label}</span>
                <span className="text-xs text-content-secondary font-medium shrink-0">
                  {win.resourceType === 'storage'
                    ? isUnlimited
                      ? '무제한'
                      : `${formatStorageBytes(win.consumed)} / ${formatStorageBytes(win.limit)}`
                    : isUnlimited
                      ? '무제한'
                      : `${win.consumed} / ${win.limit}`}
                </span>
              </div>
              {!isUnlimited && (
                <div className="h-1 bg-surface-hover rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: barColor,
                      transition: 'width 300ms cubic-bezier(0.25, 1, 0.5, 1)',
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
