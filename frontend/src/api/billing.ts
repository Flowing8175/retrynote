import type {
  UsageStatus,
  Subscription,
  CheckoutSessionResponse,
} from '../types/billing';
import apiClient from './client';

export const billingApi = {
  getUsageStatus: (): Promise<UsageStatus> =>
    apiClient.get<UsageStatus>('/billing/usage').then((r) => r.data),

  getSubscription: (): Promise<Subscription | null> =>
    apiClient.get<Subscription | null>('/billing/subscription').then((r) => r.data),

  checkoutSubscription: (
    plan: string,
    billingCycle: string,
  ): Promise<CheckoutSessionResponse> =>
    apiClient
      .post<CheckoutSessionResponse>('/billing/checkout/subscription', {
        plan,
        billing_cycle: billingCycle,
      })
      .then((r) => r.data),

  checkoutCredits: (
    creditType: string,
    packSize: string,
  ): Promise<CheckoutSessionResponse> =>
    apiClient
      .post<CheckoutSessionResponse>('/billing/checkout/credits', {
        credit_type: creditType,
        pack_size: packSize,
      })
      .then((r) => r.data),

  openPortal: (): Promise<{ portal_url: string }> =>
    apiClient
      .post<{ portal_url: string }>('/billing/portal')
      .then((r) => r.data),
};
