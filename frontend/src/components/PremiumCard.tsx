import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAppStore } from '../store';
import { TRANSLATIONS } from '../constants/categories';

interface PremiumCardProps {
  onPress: () => void;
}

/**
 * Compact premium teaser card for the settings screen.
 * Clean design that matches the app's white/blue palette — no flashy gradients.
 */
export const PremiumCard: React.FC<PremiumCardProps> = ({ onPress }) => {
  const { language } = useAppStore();
  const t = TRANSLATIONS[language];

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.75}
      testID="premium-card"
    >
      {/* Left: icon */}
      <View style={styles.iconWrapper}>
        <MaterialIcons name="workspace-premium" size={24} color="#B8860B" />
      </View>

      {/* Middle: title + subtitle */}
      <View style={styles.textWrapper}>
        <Text style={styles.title} testID="premium-title">
          {t.subscribeTitle}
        </Text>
        <Text style={styles.subtitle}>
          {t.subscribeSubtitle}
        </Text>
      </View>

      {/* Right: chevron */}
      <MaterialIcons name="chevron-right" size={24} color="#BBB" />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: '#EEE',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  iconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFF8E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrapper: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#333',
  },
  subtitle: {
    fontSize: 12,
    color: '#888',
    fontWeight: '500',
  },
});
