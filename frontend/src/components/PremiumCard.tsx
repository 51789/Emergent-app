import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { useAppStore } from '../store';

interface PremiumCardProps {
  onSubscribe: () => void;
}

/**
 * Premium subscription card with an animated gradient background.
 * Colors: royal-purple → magenta → sunset-orange — a classic "premium" feel
 * without falling into the AI-slop purple gradient trap (we anchor with warm
 * accents and use gold for icons/CTA).
 */
export const PremiumCard: React.FC<PremiumCardProps> = ({ onSubscribe }) => {
  const { language } = useAppStore();
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Subtle shimmer sweep on the "Premium" title, loops every ~3s
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 1600,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: 1600,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [shimmer]);

  const shimmerScale = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.05],
  });

  const isIt = language === 'it';

  const features = isIt
    ? [
        'Ricerche illimitate',
        'Monitoraggio 24/7 in background',
        'Notifiche prioritarie in tempo reale',
        'Accesso anticipato a nuovi agenti AI',
        'Nessuna pubblicità',
      ]
    : [
        'Unlimited searches',
        '24/7 background monitoring',
        'Priority real-time notifications',
        'Early access to new AI agents',
        'Ad-free experience',
      ];

  return (
    <LinearGradient
      colors={['#4B1FA8', '#8B2FB8', '#D63384', '#FF6B35']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}
      testID="premium-card"
    >
      {/* Decorative sparkles */}
      <View style={styles.sparkle1}>
        <MaterialIcons name="auto-awesome" size={16} color="rgba(255,215,0,0.6)" />
      </View>
      <View style={styles.sparkle2}>
        <MaterialIcons name="auto-awesome" size={20} color="rgba(255,215,0,0.5)" />
      </View>
      <View style={styles.sparkle3}>
        <MaterialIcons name="auto-awesome" size={12} color="rgba(255,215,0,0.4)" />
      </View>

      {/* Header row: crown + PREMIUM */}
      <View style={styles.headerRow}>
        <View style={styles.crownWrapper}>
          <MaterialIcons name="workspace-premium" size={26} color="#FFD700" />
        </View>
        <Animated.Text
          style={[styles.premiumTitle, { transform: [{ scale: shimmerScale }] }]}
          testID="premium-title"
        >
          JARVIS PREMIUM
        </Animated.Text>
      </View>

      {/* Subtitle */}
      <Text style={styles.subtitle}>
        {isIt
          ? 'Sblocca tutto il potenziale del tuo assistente'
          : 'Unlock your assistant’s full potential'}
      </Text>

      {/* Features list */}
      <View style={styles.featuresList}>
        {features.map((feat, idx) => (
          <View key={idx} style={styles.featureRow}>
            <View style={styles.checkCircle}>
              <MaterialIcons name="check" size={12} color="#4B1FA8" />
            </View>
            <Text style={styles.featureText}>{feat}</Text>
          </View>
        ))}
      </View>

      {/* Price hint */}
      <View style={styles.priceRow}>
        <Text style={styles.priceLabel}>
          {isIt ? 'Da' : 'From'}
        </Text>
        <Text style={styles.priceAmount}>€4,99</Text>
        <Text style={styles.priceInterval}>
          / {isIt ? 'mese' : 'month'}
        </Text>
      </View>

      {/* Subscribe CTA — golden gradient button */}
      <TouchableOpacity
        onPress={onSubscribe}
        activeOpacity={0.85}
        style={styles.ctaWrapper}
        testID="premium-subscribe-button"
      >
        <LinearGradient
          colors={['#FFD700', '#FFA500', '#FF8C00']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.ctaGradient}
        >
          <MaterialIcons name="star" size={20} color="#4B1FA8" />
          <Text style={styles.ctaText}>
            {isIt ? 'ABBONATI ORA' : 'SUBSCRIBE NOW'}
          </Text>
          <MaterialIcons name="arrow-forward" size={20} color="#4B1FA8" />
        </LinearGradient>
      </TouchableOpacity>

      {/* Small print */}
      <Text style={styles.smallPrint}>
        {isIt
          ? 'Cancella quando vuoi • 7 giorni di prova gratuita'
          : 'Cancel anytime • 7-day free trial'}
      </Text>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 20,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#8B2FB8',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  sparkle1: {
    position: 'absolute',
    top: 16,
    right: 20,
  },
  sparkle2: {
    position: 'absolute',
    top: 60,
    right: 45,
  },
  sparkle3: {
    position: 'absolute',
    bottom: 100,
    left: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  crownWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  premiumTitle: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 1.5,
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 18,
    letterSpacing: 0.2,
  },
  featuresList: {
    gap: 8,
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
    backgroundColor: '#FFD700',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginBottom: 14,
  },
  priceLabel: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    fontWeight: '500',
  },
  priceAmount: {
    color: '#FFF',
    fontSize: 28,
    fontWeight: '900',
  },
  priceInterval: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    fontWeight: '500',
  },
  ctaWrapper: {
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  ctaGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    gap: 8,
  },
  ctaText: {
    color: '#4B1FA8',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 1,
  },
  smallPrint: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 10,
    fontWeight: '500',
  },
});
