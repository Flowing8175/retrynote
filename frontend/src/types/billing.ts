export type UserTier = 'free' | 'lite' | 'standard' | 'pro';
export type BillingCycle = 'monthly' | 'quarterly';
export type ResourceType = 'quiz' | 'ocr' | 'storage';

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
}

export interface UsageStatus {
  tier: UserTier;
  windows: UsageWindow[];
  credits: CreditBalance;
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

export interface ManageUrlsResponse {
  updatePaymentMethodUrl: string | null;
  cancelUrl: string | null;
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
  lite: { name: 'Lite', color: 'blue' },
  standard: { name: 'Standard', color: 'indigo' },
  pro: { name: 'Pro', color: 'purple' },
};
