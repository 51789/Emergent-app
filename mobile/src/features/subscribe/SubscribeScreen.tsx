import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useBillingMe, usePlans } from '@/api/hooks';
import type { BillingCycle, PlanId } from '@/api/types';
import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { BrandHeader } from '@/components/BrandHeader';
import { dialog } from '@/components/dialog/dialog';
import { Screen, STACK_EDGES } from '@/components/Screen';
import { Segmented } from '@/components/Segmented';
import { Banner, ErrorState, LoadingState } from '@/components/StateViews';
import { useErrorMessage } from '@/i18n/useErrorMessage';
import { colors, spacing } from '@/theme';
import { getErrorMessageKey, isAlreadySubscribedError } from '@/utils/errors';
import { maxYearlySavingsPercent } from '@/utils/format';

import { CurrentPlanBanner } from './CurrentPlanBanner';
import { PlanCard } from './PlanCard';
import { useBillingFlow, useCheckoutReturn, type CheckoutOutcome } from './useBillingFlow';

// NOTE (store policy): selling digital subscriptions inside an iOS/Android store build requires
// Apple IAP / Google Play Billing (RevenueCat is the usual integration). This screen uses the
// backend's web checkout, which is correct for web and for testing, but not for store release.
// See `useBillingFlow.ts` and the README ("In-app purchases").

type Feedback = { tone: 'success' | 'info' | 'warning'; text: string };

/** Plans from GET /billing/plans, monthly/yearly toggle, checkout and subscription management. */
export function SubscribeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const errorMessage = useErrorMessage();

  const plans = usePlans();
  const billing = useBillingMe();
  const flow = useBillingFlow();
  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const showOutcome = useCallback(
    (outcome: CheckoutOutcome) => {
      if (outcome === 'confirmed') setFeedback({ tone: 'success', text: t('subscribe.success') });
      else if (outcome === 'canceled') setFeedback({ tone: 'warning', text: t('subscribe.canceled') });
      else setFeedback(null);
    },
    [t],
  );

  // Returning from the hosted checkout page (web redirect, or a deep link on native).
  const { confirmPayment } = flow;
  const handleReturn = useCallback(
    async (result: 'success' | 'cancel') => {
      if (result === 'cancel') {
        showOutcome('canceled');
        return;
      }
      setFeedback({ tone: 'info', text: t('subscribe.confirming') });
      showOutcome(await confirmPayment(undefined));
    },
    [confirmPayment, showOutcome, t],
  );
  useCheckoutReturn((result) => void handleReturn(result));

  const handleSubscribe = async (plan: Exclude<PlanId, 'free'>) => {
    setFeedback(null);
    try {
      const outcome = await flow.startCheckout(plan, cycle);
      if (outcome === 'redirected') return;
      if (outcome === 'canceled') {
        showOutcome(outcome);
        return;
      }
      setFeedback({ tone: 'info', text: t('subscribe.confirming') });
      showOutcome(await flow.confirmPayment(billing.data));
    } catch (error) {
      if (isAlreadySubscribedError(error)) {
        // Checkout while already subscribed (409): changing or cancelling happens in the portal.
        const manage = await dialog.prompt({
          title: t('subscribe.alreadySubscribedTitle'),
          message: t('subscribe.alreadySubscribedMessage'),
          actionLabel: t('subscribe.manage'),
        });
        if (manage) await handleManage();
        return;
      }
      void dialog.alert(t('subscribe.title'), describe(error, t('subscribe.checkoutError')));
    }
  };

  /** Known API errors get their own message (e.g. billing not configured); unknown ones the fallback. */
  const describe = (error: unknown, fallback: string) =>
    getErrorMessageKey(error) === 'errors.generic' ? fallback : errorMessage(error);

  const handleManage = async () => {
    try {
      await flow.openPortal();
    } catch (error) {
      void dialog.alert(t('subscribe.title'), describe(error, t('subscribe.portalError')));
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    await Promise.allSettled([plans.refetch(), billing.refetch()]);
    setRefreshing(false);
  };

  const savingsPercent = plans.data ? maxYearlySavingsPercent(plans.data) : null;
  const subscribed = billing.data && billing.data.plan !== 'free' && billing.data.status !== 'none';
  const paidPlans = plans.data?.filter((plan) => plan.id !== 'free') ?? [];
  const bestPlanId = paidPlans.length > 1 ? paidPlans[paidPlans.length - 1].id : null;

  return (
    <Screen edges={STACK_EDGES}>
      <BrandHeader onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
      >
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <MaterialIcons name="workspace-premium" size={32} color={colors.warning} />
          </View>
          <AppText variant="title" align="center">
            {t('subscribe.heroTitle')}
          </AppText>
          <AppText variant="body" color="textMuted" align="center">
            {t('subscribe.heroSubtitle')}
          </AppText>
        </View>

        {feedback ? <Banner tone={feedback.tone} message={feedback.text} /> : null}

        {subscribed && billing.data ? (
          <CurrentPlanBanner billing={billing.data} onManage={handleManage} managing={flow.portalBusy} />
        ) : null}

        <Segmented
          value={cycle}
          onChange={setCycle}
          options={[
            { value: 'monthly', label: t('subscribe.monthly') },
            {
              value: 'yearly',
              label: t('subscribe.yearly'),
              accessory: savingsPercent ? <Badge label={`-${savingsPercent}%`} tone="success" /> : undefined,
            },
          ]}
        />

        {plans.isPending ? <LoadingState style={styles.loading} /> : null}
        {plans.isError ? (
          <ErrorState message={t('subscribe.loadError')} onRetry={() => void plans.refetch()} />
        ) : null}
        {plans.data?.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            cycle={cycle}
            highlighted={plan.id === bestPlanId}
            isCurrent={
              billing.data?.plan === plan.id && billing.data.cycle === cycle && billing.data.status === 'active'
            }
            loading={flow.busyPlan === plan.id}
            disabled={flow.busyPlan !== null}
            onSubscribe={() => void handleSubscribe(plan.id as Exclude<PlanId, 'free'>)}
          />
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg },
  hero: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.warningSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loading: { minHeight: 160 },
});
