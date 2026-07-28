import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { useAppStore } from '../src/store';
import { api } from '../src/services/api';
import { useAuth } from '../src/services/auth';
import { BrandHeader } from '../src/components/BrandHeader';

type PlanId = 'pro' | 'premium';
type Cycle = 'monthly' | 'yearly';

interface Plan {
  id: PlanId;
  name: string;
  monthlyPrice: string;
  yearlyPrice: string;
  monthlyAmount: number;
  yearlyAmount: number;
  tagline: string;
  features: string[];
  highlight?: string;
}

WebBrowser.maybeCompleteAuthSession();

export default function SubscribeScreen() {
  const { language } = useAppStore();
  const { user, refreshMe } = useAuth();
  const params = useLocalSearchParams<{ session_id?: string }>();
  const isIt = language === 'it';

  const [selected, setSelected] = useState<PlanId>('premium');
  const [cycle, setCycle] = useState<Cycle>('monthly');
  const [loadingPlan, setLoadingPlan] = useState<PlanId | null>(null);
  const [me, setMe] = useState<{
    plan: string;
    plan_expires_at: string | null;
    subscription_active: boolean;
    billing_cycle: string | null;
  } | null>(null);
  const pollRef = useRef<number | null>(null);

  // Load current subscription
  const loadMe = useCallback(async () => {
    try {
      const data = await api.billingMe();
      setMe(data);
    } catch {
      setMe(null);
    }
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  // When we return from Stripe with ?session_id=..., poll the status
  useEffect(() => {
    const sid = params?.session_id;
    if (!sid || typeof sid !== 'string') return;
    let attempts = 0;
    const maxAttempts = 8;
    const poll = async () => {
      try {
        const r = await api.billingStatus(sid);
        if (r.plan_applied || r.payment_status === 'paid') {
          Alert.alert(
            isIt ? 'Pagamento completato' : 'Payment completed',
            isIt
              ? `Il tuo piano ${(r.plan || '').toUpperCase()} è ora attivo!`
              : `Your ${(r.plan || '').toUpperCase()} plan is now active!`
          );
          await loadMe();
          try {
            await refreshMe();
          } catch {
            // ignore
          }
          return;
        }
        if (r.status === 'expired') {
          Alert.alert(
            isIt ? 'Sessione scaduta' : 'Session expired',
            isIt
              ? 'La sessione di pagamento è scaduta.'
              : 'The payment session has expired.'
          );
          return;
        }
      } catch {
        // ignore transient errors
      }
      attempts += 1;
      if (attempts < maxAttempts) {
        pollRef.current = setTimeout(poll, 2000) as unknown as number;
      }
    };
    poll();
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.session_id]);

  const plans: Plan[] = [
    {
      id: 'pro',
      name: 'PRO',
      monthlyPrice: '€2,99',
      yearlyPrice: '€29,99',
      monthlyAmount: 2.99,
      yearlyAmount: 29.99,
      tagline: isIt
        ? 'Per chi cerca con moderazione'
        : 'For casual users',
      features: isIt
        ? [
            '5 ricerche attive contemporanee',
            'Aggiornamenti giornalieri',
            'Notifiche standard',
            'Cronologia ricerche',
          ]
        : [
            '5 concurrent active searches',
            'Daily updates',
            'Standard notifications',
            'Search history',
          ],
    },
    {
      id: 'premium',
      name: 'PREMIUM',
      monthlyPrice: '€4,99',
      yearlyPrice: '€49,99',
      monthlyAmount: 4.99,
      yearlyAmount: 49.99,
      tagline: isIt
        ? 'Per il monitoraggio continuo'
        : 'For continuous monitoring',
      highlight: isIt ? 'MIGLIORE OFFERTA' : 'BEST VALUE',
      features: isIt
        ? [
            'Ricerche illimitate',
            'Monitoraggio 24/7 in tempo reale',
            'Notifiche prioritarie',
            'Accesso anticipato a nuovi agenti',
            'Nessuna pubblicità',
          ]
        : [
            'Unlimited searches',
            '24/7 real-time monitoring',
            'Priority notifications',
            'Early access to new agents',
            'Ad-free experience',
          ],
    },
  ];

  const handleSubscribe = async (planId: PlanId) => {
    if (!user) {
      Alert.alert(
        isIt ? 'Accesso richiesto' : 'Login required',
        isIt
          ? 'Effettua il login per sottoscrivere un abbonamento.'
          : 'Please log in to subscribe.',
        [
          { text: isIt ? 'Annulla' : 'Cancel', style: 'cancel' },
          { text: isIt ? 'Accedi' : 'Sign in', onPress: () => router.push('/login') },
        ]
      );
      return;
    }
    try {
      setLoadingPlan(planId);

      // Build return URLs pointing back at this screen
      const successUrl = Linking.createURL('subscribe');
      const cancelUrl = Linking.createURL('subscribe');

      const res = await api.billingCheckout(planId, cycle, successUrl, cancelUrl);

      if (Platform.OS === 'web') {
        // Open Stripe checkout in the same tab so `session_id` returns via URL
        window.location.assign(res.url);
        return;
      }

      // Native: open Stripe checkout in an in-app browser session
      const result = await WebBrowser.openAuthSessionAsync(res.url, successUrl);
      if (result.type === 'success' && result.url) {
        // Extract session_id from the return URL and poll status
        const parsed = Linking.parse(result.url);
        const sid = (parsed.queryParams?.session_id as string) || res.session_id;
        // Poll once immediately, then again if needed
        const status = await api.billingStatus(sid);
        if (status.plan_applied || status.payment_status === 'paid') {
          Alert.alert(
            isIt ? 'Pagamento completato' : 'Payment completed',
            isIt
              ? `Il tuo piano ${(status.plan || '').toUpperCase()} è ora attivo!`
              : `Your ${(status.plan || '').toUpperCase()} plan is now active!`
          );
          await loadMe();
          try {
            await refreshMe();
          } catch {
            // ignore
          }
        }
      }
    } catch (e: any) {
      Alert.alert(
        isIt ? 'Errore' : 'Error',
        e?.message || (isIt ? 'Impossibile avviare il pagamento' : 'Cannot start checkout')
      );
    } finally {
      setLoadingPlan(null);
    }
  };

  const handleCancel = () => {
    Alert.alert(
      isIt ? 'Annulla abbonamento' : 'Cancel subscription',
      isIt
        ? 'Il rinnovo automatico sarà disattivato. Conserverai l\'accesso fino alla data di scadenza.'
        : 'Auto-renewal will be disabled. You will keep access until the expiry date.',
      [
        { text: isIt ? 'Annulla' : 'Cancel', style: 'cancel' },
        {
          text: isIt ? 'Conferma' : 'Confirm',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.billingCancel();
              await loadMe();
              Alert.alert(
                isIt ? 'Fatto' : 'Done',
                isIt ? 'Rinnovo disattivato.' : 'Auto-renewal disabled.'
              );
            } catch {
              Alert.alert(
                isIt ? 'Errore' : 'Error',
                isIt ? 'Impossibile annullare' : 'Cannot cancel'
              );
            }
          },
        },
      ]
    );
  };

  const currentPlan = (me?.plan || 'free').toLowerCase();
  const showCancel =
    !!me &&
    me.subscription_active &&
    currentPlan !== 'free' &&
    !!me.plan_expires_at;

  const formatExpiry = (iso: string | null) => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(language === 'it' ? 'it-IT' : 'en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return iso;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Brand header */}
      <BrandHeader onBack={() => router.back()} />

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.heroIconWrapper}>
            <MaterialIcons name="workspace-premium" size={32} color="#B8860B" />
          </View>
          <Text style={styles.heroTitle}>
            {isIt ? 'Sblocca tutto CONNECTA' : 'Unlock all of CONNECTA'}
          </Text>
          <Text style={styles.heroSubtitle}>
            {isIt
              ? 'Scegli il piano più adatto alle tue esigenze'
              : 'Pick the plan that best fits your needs'}
          </Text>
        </View>

        {/* Current plan banner */}
        {me && currentPlan !== 'free' && (
          <View style={styles.currentBanner}>
            <MaterialIcons name="verified" size={22} color="#0A7A2F" />
            <View style={{ flex: 1 }}>
              <Text style={styles.currentBannerTitle}>
                {(isIt ? 'Piano attuale: ' : 'Current plan: ') + currentPlan.toUpperCase()}
              </Text>
              {me.plan_expires_at && (
                <Text style={styles.currentBannerSub}>
                  {me.subscription_active
                    ? (isIt ? 'Rinnovo il ' : 'Renews on ') + formatExpiry(me.plan_expires_at)
                    : (isIt ? 'Attivo fino al ' : 'Active until ') + formatExpiry(me.plan_expires_at)}
                </Text>
              )}
            </View>
            {showCancel && (
              <TouchableOpacity onPress={handleCancel} testID="cancel-subscription">
                <Text style={styles.cancelLink}>
                  {isIt ? 'Annulla' : 'Cancel'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Billing cycle toggle */}
        <View style={styles.cycleToggle}>
          <TouchableOpacity
            style={[styles.cycleBtn, cycle === 'monthly' && styles.cycleBtnActive]}
            onPress={() => setCycle('monthly')}
            testID="cycle-monthly"
            activeOpacity={0.85}
          >
            <Text style={[styles.cycleBtnText, cycle === 'monthly' && styles.cycleBtnTextActive]}>
              {isIt ? 'Mensile' : 'Monthly'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.cycleBtn, cycle === 'yearly' && styles.cycleBtnActive]}
            onPress={() => setCycle('yearly')}
            testID="cycle-yearly"
            activeOpacity={0.85}
          >
            <Text style={[styles.cycleBtnText, cycle === 'yearly' && styles.cycleBtnTextActive]}>
              {isIt ? 'Annuale' : 'Yearly'}
            </Text>
            <View style={styles.savingsPill}>
              <Text style={styles.savingsText}>-17%</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Plans */}
        {plans.map((plan) => {
          const isSelected = selected === plan.id;
          const isPremium = plan.id === 'premium';
          const price = cycle === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice;
          const period = cycle === 'monthly'
            ? (isIt ? 'al mese' : 'per month')
            : (isIt ? 'all\'anno' : 'per year');

          return (
            <TouchableOpacity
              key={plan.id}
              style={[
                styles.planCard,
                isSelected && styles.planCardSelected,
                isPremium && styles.planCardPremium,
              ]}
              onPress={() => setSelected(plan.id)}
              activeOpacity={0.85}
              testID={`plan-${plan.id}`}
            >
              {plan.highlight && (
                <View style={styles.highlightBadge}>
                  <MaterialIcons name="star" size={12} color="#FFF" />
                  <Text style={styles.highlightText}>{plan.highlight}</Text>
                </View>
              )}

              <View style={styles.planHeader}>
                <View style={styles.planNameRow}>
                  <MaterialIcons
                    name={isSelected ? 'radio-button-checked' : 'radio-button-unchecked'}
                    size={22}
                    color={isSelected ? '#007AFF' : '#CCC'}
                  />
                  <Text
                    style={[styles.planName, isPremium && styles.planNamePremium]}
                    testID={`plan-name-${plan.id}`}
                  >
                    {plan.name}
                  </Text>
                </View>
                <Text style={styles.planTagline}>{plan.tagline}</Text>
              </View>

              <View style={styles.priceRow}>
                <Text style={[styles.priceAmount, isPremium && styles.priceAmountPremium]}>
                  {price}
                </Text>
                <Text style={styles.pricePeriod}>{period}</Text>
              </View>

              <View style={styles.divider} />

              <View style={styles.featuresList}>
                {plan.features.map((feat, idx) => (
                  <View key={idx} style={styles.featureRow}>
                    <View
                      style={[
                        styles.checkCircle,
                        isPremium && styles.checkCirclePremium,
                      ]}
                    >
                      <MaterialIcons name="check" size={12} color="#FFF" />
                    </View>
                    <Text style={styles.featureText}>{feat}</Text>
                  </View>
                ))}
              </View>

              <TouchableOpacity
                style={[
                  styles.planCta,
                  isPremium ? styles.planCtaPremium : styles.planCtaPro,
                  loadingPlan === plan.id && { opacity: 0.6 },
                ]}
                onPress={() => handleSubscribe(plan.id)}
                disabled={loadingPlan !== null}
                activeOpacity={0.85}
                testID={`subscribe-${plan.id}`}
              >
                {loadingPlan === plan.id ? (
                  <ActivityIndicator size="small" color={isPremium ? '#FFF' : '#007AFF'} />
                ) : (
                  <>
                    <Text
                      style={[
                        styles.planCtaText,
                        isPremium ? styles.planCtaTextPremium : styles.planCtaTextPro,
                      ]}
                    >
                      {isIt ? `Scegli ${plan.name}` : `Choose ${plan.name}`}
                    </Text>
                    <MaterialIcons
                      name="arrow-forward"
                      size={18}
                      color={isPremium ? '#FFF' : '#007AFF'}
                    />
                  </>
                )}
              </TouchableOpacity>
            </TouchableOpacity>
          );
        })}

        {/* Small print */}
        <View style={styles.smallPrintWrapper}>
          <MaterialIcons name="info-outline" size={14} color="#999" />
          <Text style={styles.smallPrint}>
            {isIt
              ? 'Pagamento sicuro tramite Stripe • Cancella quando vuoi • Nessun impegno'
              : 'Secure payment via Stripe • Cancel anytime • No commitment'}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F8FA',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  backButton: {
    padding: 8,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#333',
  },
  headerRight: {
    width: 44,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  hero: {
    alignItems: 'center',
    marginBottom: 20,
  },
  heroIconWrapper: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFF8E1',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1A1A1A',
    textAlign: 'center',
    marginBottom: 4,
  },
  heroSubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  currentBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#E8F5E9',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#B7DFC0',
  },
  currentBannerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0A7A2F',
  },
  currentBannerSub: {
    fontSize: 12,
    color: '#3B7D50',
    marginTop: 2,
  },
  cancelLink: {
    fontSize: 13,
    color: '#D14343',
    fontWeight: '700',
  },
  cycleToggle: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#EDEEF0',
  },
  cycleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 9,
  },
  cycleBtnActive: {
    backgroundColor: '#007AFF',
  },
  cycleBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#555',
  },
  cycleBtnTextActive: {
    color: '#FFF',
  },
  savingsPill: {
    backgroundColor: '#FFC107',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  savingsText: {
    color: '#3A2F00',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  planCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#EDEEF0',
    boxShadow: '0 2px 6px rgba(0,0,0,0.05)',
    elevation: 2,
    position: 'relative',
  },
  planCardSelected: {
    borderColor: '#007AFF',
  },
  planCardPremium: {
    backgroundColor: '#FFFDF7',
    borderColor: '#E8D9A8',
  },
  highlightBadge: {
    position: 'absolute',
    top: -10,
    right: 16,
    backgroundColor: '#B8860B',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  highlightText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  planHeader: {
    marginBottom: 12,
  },
  planNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  planName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1A1A1A',
    letterSpacing: 1,
  },
  planNamePremium: {
    color: '#B8860B',
  },
  planTagline: {
    fontSize: 13,
    color: '#666',
    marginLeft: 30,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginBottom: 14,
    marginLeft: 30,
  },
  priceAmount: {
    fontSize: 32,
    fontWeight: '900',
    color: '#1A1A1A',
  },
  priceAmountPremium: {
    color: '#B8860B',
  },
  pricePeriod: {
    fontSize: 14,
    color: '#888',
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: '#F0F0F0',
    marginBottom: 14,
  },
  featuresList: {
    gap: 10,
    marginBottom: 18,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checkCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCirclePremium: {
    backgroundColor: '#B8860B',
  },
  featureText: {
    flex: 1,
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  planCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 13,
  },
  planCtaPro: {
    backgroundColor: '#FFF',
    borderWidth: 2,
    borderColor: '#007AFF',
  },
  planCtaPremium: {
    backgroundColor: '#B8860B',
  },
  planCtaText: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  planCtaTextPro: {
    color: '#007AFF',
  },
  planCtaTextPremium: {
    color: '#FFF',
  },
  smallPrintWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 12,
  },
  smallPrint: {
    fontSize: 11,
    color: '#999',
    fontStyle: 'italic',
    textAlign: 'center',
    flexShrink: 1,
  },
});
