import type {
  UsageStatus,
  Subscription,
  CheckoutSessionResponse,
  ManageUrlsResponse,
} from '../types/billing';
import type { ApiStatusResponse } from '../types';
import apiClient from './client';

export interface PaddleConfig {
  clientToken: string;
  environment: string;
}

export const billingApi = {
  getUsageStatus: (): Promise<UsageStatus> =>
    apiClient.get<UsageStatus>('/billing/usage').then((r) => r.data),

  getPaddleConfig: (): Promise<PaddleConfig> =>
    apiClient.get<PaddleConfig>('/billing/paddle-config').then((r) => r.data),

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

  getManageUrls: (): Promise<ManageUrlsResponse> =>
    apiClient.get<ManageUrlsResponse>('/billing/manage-urls').then((r) => r.data),

  cancelSubscription: (): Promise<ApiStatusResponse> =>
    apiClient.post<ApiStatusResponse>('/billing/cancel').then((r) => r.data),
};
