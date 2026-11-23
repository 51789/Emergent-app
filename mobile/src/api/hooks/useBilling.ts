import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { billingApi } from '../endpoints';
import { qk } from '../queryKeys';
import { usePrefs } from '@/store/prefs';

import type { CheckoutBody } from '../types';

/** Plans with feature strings localised in the current UI language (refetched when it changes). */
export function usePlans() {
  const language = usePrefs((state) => state.language);
  return useQuery({
    queryKey: qk.billing.plans(language),
    queryFn: () => billingApi.plans(language),
    staleTime: 5 * 60_000,
  });
}

export function useBillingMe() {
  return useQuery({ queryKey: qk.billing.me, queryFn: billingApi.me });
}

export function useCheckout() {
  return useMutation({ mutationFn: (body: CheckoutBody) => billingApi.checkout(body) });
}

export function usePortal() {
  return useMutation({ mutationFn: (returnUrl: string) => billingApi.portal(returnUrl) });
}

/** Returns a function that refetches /billing/me (e.g. after returning from the checkout page). */
export function useRefreshBilling() {
  const client = useQueryClient();
  return () => client.fetchQuery({ queryKey: qk.billing.me, queryFn: billingApi.me, staleTime: 0 });
}
