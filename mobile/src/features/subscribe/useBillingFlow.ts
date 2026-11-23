import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { useCheckout, usePortal, useRefreshBilling } from '@/api/hooks';
import type { BillingCycle, BillingMe, PlanId } from '@/api/types';
import { refreshUser } from '@/features/auth/session';
import { pollUntil } from '@/utils/poll';

/**
 * Checkout / customer-portal flow (web payments through the backend's payment provider).
 *
 * IMPORTANT - store policy: Apple (App Store) and Google (Play Store) require digital
 * subscriptions sold inside the app to use their in-app purchase systems. Opening an external
 * checkout page, as done here, is fine for the web build and for development/testing, but a
 * store-distributed iOS/Android build will be rejected unless it uses IAP (RevenueCat is the usual
 * way to unify StoreKit + Play Billing and sync entitlements with the backend). This is
 * deliberately NOT implemented yet: see the "In-app purchases" section of the README.
 */

const CONFIRM_ATTEMPTS = 6;
const CONFIRM_INTERVAL_MS = 2000;

export type CheckoutOutcome = 'confirmed' | 'pending' | 'canceled';

/** URL the payment page redirects back to. `checkout` tells the screen how it went. */
function subscribeUrl(result?: 'success' | 'cancel'): string {
  return Linking.createURL('subscribe', result ? { queryParams: { checkout: result } } : undefined);
}

function openOnWeb(url: string): void {
  // Same tab: the payment provider redirects back to /subscribe?checkout=...
  window.location.assign(url);
}

/**
 * Detects the return from the hosted checkout page (`/subscribe?checkout=success|cancel`: a web
 * redirect, or a deep link on native), clears the parameter and reports the result once.
 */
export function useCheckoutReturn(onReturn: (result: 'success' | 'cancel') => void): void {
  const { checkout } = useLocalSearchParams<{ checkout?: string }>();
  const router = useRouter();

  useEffect(() => {
    if (checkout === 'success' || checkout === 'cancel') {
      router.setParams({ checkout: undefined });
      onReturn(checkout);
    }
  }, [checkout, onReturn, router]);
}

export interface BillingFlow {
  startCheckout: (plan: Exclude<PlanId, 'free'>, cycle: BillingCycle) => Promise<CheckoutOutcome | 'redirected'>;
  openPortal: () => Promise<void>;
  /** Polls /billing/me until the plan reflects the payment (webhooks can take a few seconds). */
  confirmPayment: (previous: BillingMe | undefined) => Promise<CheckoutOutcome>;
  busyPlan: PlanId | null;
  portalBusy: boolean;
}

export function useBillingFlow(): BillingFlow {
  const checkout = useCheckout();
  const portal = usePortal();
  const refreshBilling = useRefreshBilling();
  const [busyPlan, setBusyPlan] = useState<PlanId | null>(null);

  const confirmPayment = useCallback(
    async (previous: BillingMe | undefined): Promise<CheckoutOutcome> => {
      const changed = (me: BillingMe) =>
        me.status === 'active' && (me.plan !== previous?.plan || me.cycle !== previous?.cycle);
      const latest = await pollUntil(refreshBilling, changed, {
        attempts: CONFIRM_ATTEMPTS,
        intervalMs: CONFIRM_INTERVAL_MS,
      });
      await refreshUser();
      return latest && changed(latest) ? 'confirmed' : 'pending';
    },
    [refreshBilling],
  );

  const startCheckout = useCallback<BillingFlow['startCheckout']>(
    async (plan, cycle) => {
      setBusyPlan(plan);
      try {
        const { url } = await checkout.mutateAsync({
          plan,
          cycle,
          success_url: subscribeUrl('success'),
          cancel_url: subscribeUrl('cancel'),
        });
        if (Platform.OS === 'web') {
          openOnWeb(url);
          return 'redirected';
        }
        const session = await WebBrowser.openAuthSessionAsync(url, subscribeUrl());
        if (session.type === 'success' && session.url.includes('checkout=cancel')) return 'canceled';
        return 'pending';
      } finally {
        setBusyPlan(null);
      }
    },
    [checkout],
  );

  const openPortal = useCallback(async () => {
    const { url } = await portal.mutateAsync(subscribeUrl());
    if (Platform.OS === 'web') {
      openOnWeb(url);
      return;
    }
    await WebBrowser.openBrowserAsync(url);
    await refreshBilling();
    await refreshUser();
  }, [portal, refreshBilling]);

  return { startCheckout, openPortal, confirmPayment, busyPlan, portalBusy: portal.isPending };
}
