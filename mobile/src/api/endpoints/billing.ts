import { apiClient } from '../instance';
import type { BillingMe, CheckoutBody, LanguageCode, Plan, UrlResponse } from '../types';

export const billingApi = {
  /** `language` localises the feature strings of each plan. */
  plans: (language?: LanguageCode) => apiClient.get<Plan[]>('/billing/plans', { language }),
  me: () => apiClient.get<BillingMe>('/billing/me'),
  checkout: (body: CheckoutBody) => apiClient.post<UrlResponse>('/billing/checkout', body),
  portal: (returnUrl: string) => apiClient.post<UrlResponse>('/billing/portal', { return_url: returnUrl }),
};
