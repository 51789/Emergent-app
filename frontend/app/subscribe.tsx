import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAppStore } from '../src/store';

type PlanId = 'pro' | 'premium';

interface Plan {
  id: PlanId;
  name: string;
  price: string;
  period: string;
  tagline: string;
  features: string[];
  ctaLabel: string;
  highlight?: string;
}

export default function SubscribeScreen() {
  const { language } = useAppStore();
  const isIt = language === 'it';
  const [selected, setSelected] = useState<PlanId>('premium');

  const plans: Plan[] = [
    {
      id: 'pro',
      name: 'PRO',
      price: '€2,99',
      period: isIt ? 'al mese' : 'per month',
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
      ctaLabel: isIt ? 'Scegli PRO' : 'Choose PRO',
    },
    {
      id: 'premium',
      name: 'PREMIUM',
      price: '€4,99',
      period: isIt ? 'al mese' : 'per month',
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
      ctaLabel: isIt ? 'Scegli PREMIUM' : 'Choose PREMIUM',
    },
  ];

  const handleSubscribe = (planId: PlanId) => {
    Alert.alert(
      isIt ? 'Abbonamento' : 'Subscription',
      isIt
        ? `Grazie per aver scelto il piano ${planId.toUpperCase()}! La sottoscrizione sarà disponibile a breve.`
        : `Thanks for choosing the ${planId.toUpperCase()} plan! Subscription will be available soon.`,
      [{ text: 'OK' }]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          testID="back-button"
        >
          <MaterialIcons name="arrow-back" size={26} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {isIt ? 'Scegli il tuo piano' : 'Choose your plan'}
        </Text>
        <View style={styles.headerRight} />
      </View>

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
            {isIt ? 'Sblocca tutto JARVIS' : 'Unlock all of JARVIS'}
          </Text>
          <Text style={styles.heroSubtitle}>
            {isIt
              ? 'Scegli il piano più adatto alle tue esigenze'
              : 'Pick the plan that best fits your needs'}
          </Text>
        </View>

        {/* Plans */}
        {plans.map((plan) => {
          const isSelected = selected === plan.id;
          const isPremium = plan.id === 'premium';

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
                    style={[
                      styles.planName,
                      isPremium && styles.planNamePremium,
                    ]}
                    testID={`plan-name-${plan.id}`}
                  >
                    {plan.name}
                  </Text>
                </View>
                <Text style={styles.planTagline}>{plan.tagline}</Text>
              </View>

              <View style={styles.priceRow}>
                <Text
                  style={[
                    styles.priceAmount,
                    isPremium && styles.priceAmountPremium,
                  ]}
                >
                  {plan.price}
                </Text>
                <Text style={styles.pricePeriod}>{plan.period}</Text>
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
                      <MaterialIcons
                        name="check"
                        size={12}
                        color="#FFF"
                      />
                    </View>
                    <Text style={styles.featureText}>{feat}</Text>
                  </View>
                ))}
              </View>

              <TouchableOpacity
                style={[
                  styles.planCta,
                  isPremium ? styles.planCtaPremium : styles.planCtaPro,
                ]}
                onPress={() => handleSubscribe(plan.id)}
                activeOpacity={0.85}
                testID={`subscribe-${plan.id}`}
              >
                <Text
                  style={[
                    styles.planCtaText,
                    isPremium
                      ? styles.planCtaTextPremium
                      : styles.planCtaTextPro,
                  ]}
                >
                  {plan.ctaLabel}
                </Text>
                <MaterialIcons
                  name="arrow-forward"
                  size={18}
                  color={isPremium ? '#FFF' : '#007AFF'}
                />
              </TouchableOpacity>
            </TouchableOpacity>
          );
        })}

        {/* Small print */}
        <View style={styles.smallPrintWrapper}>
          <MaterialIcons name="info-outline" size={14} color="#999" />
          <Text style={styles.smallPrint}>
            {isIt
              ? 'Cancella quando vuoi • 7 giorni di prova gratuita • Nessun impegno'
              : 'Cancel anytime • 7-day free trial • No commitment'}
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
    marginBottom: 28,
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
  planCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#EDEEF0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
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
