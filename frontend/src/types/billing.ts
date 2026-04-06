export type UserTier = 'free' | 'learner' | 'pro';
export type BillingCycle = 'monthly' | 'quarterly';
export type ResourceType = 'quiz' | 'ocr' | 'storage';
export type CreditType = 'storage' | 'ai';

export interface TierLimits {
  storageBytes: number;
  quizPerWindow: number;
  ocrPagesPerWindow: number;
  allowedModels: string[];
}

export interface UsageWindow {
  resourceType: ResourceType;
  consumed: number;
  limit: number;
  windowStartsAt: string;
  windowEndsAt: string;
  source: 'tier' | 'credit';
}

export interface CreditBalance {
  storageCreditsBytes: number;
  aiCreditsCount: number;
}

export interface UsageStatus {
  tier: UserTier;
  windows: UsageWindow[];
  credits: CreditBalance;
  freeTrialUsedAt: string | null;
  freeTrialAvailable: boolean;
}

export interface Subscription {
  id: string;
  tier: UserTier;
  billingCycle: BillingCycle;
  status: 'active' | 'past_due' | 'canceled' | 'trialing';
  currentPeriodEnd: string;
}

export interface CheckoutSessionResponse {
  sessionUrl: string;
}

export interface UpgradePromptPayload {
  detail: string;
  limitType: ResourceType | 'model_access';
  currentUsage: number;
  limit: number;
  upgradeUrl: string;
}

export const TIER_DISPLAY: Record<UserTier, { name: string; color: string }> = {
  free: { name: 'Free', color: 'gray' },
  learner: { name: 'Learner Lite', color: 'blue' },
  pro: { name: 'Learner Pro', color: 'purple' },
};
