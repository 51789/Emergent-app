import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { colors, TOUCH_TARGET } from '@/theme';

import { AppText } from './AppText';

interface NotificationBellProps {
  /** Unseen results. The bell turns red and shakes while this is > 0. */
  count: number;
  onPress: () => void;
}

const useNativeDriver = Platform.OS !== 'web';

export function NotificationBell({ count, onPress }: NotificationBellProps) {
  const { t } = useTranslation();
  const [shake] = useState(() => new Animated.Value(0));
  const hasUnseen = count > 0;

  useEffect(() => {
    if (!hasUnseen) {
      shake.setValue(0);
      return;
    }
    const step = (toValue: number, duration: number) =>
      Animated.timing(shake, { toValue, duration, easing: Easing.linear, useNativeDriver });
    const loop = Animated.loop(
      Animated.sequence([step(1, 80), step(-1, 160), step(1, 160), step(0, 80), Animated.delay(2200)]),
    );
    loop.start();
    return () => loop.stop();
  }, [hasUnseen, shake]);

  const rotate = shake.interpolate({ inputRange: [-1, 1], outputRange: ['-15deg', '15deg'] });

  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={
        hasUnseen ? t('home.notificationsUnseen', { count }) : t('home.notifications')
      }
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      testID="notification-bell"
    >
      <Animated.View style={hasUnseen ? { transform: [{ rotate }] } : undefined}>
        <MaterialIcons
          name={hasUnseen ? 'notifications-active' : 'notifications-none'}
          size={24}
          color={hasUnseen ? colors.alert : colors.text}
        />
      </Animated.View>
      {hasUnseen ? (
        <View style={styles.badge}>
          <AppText variant="label" style={styles.badgeText} numberOfLines={1}>
            {count > 99 ? '99+' : String(count)}
          </AppText>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { width: TOUCH_TARGET, height: TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.55 },
  badge: {
    position: 'absolute',
    top: 4,
    right: 0,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.alert,
    borderWidth: 2,
    borderColor: colors.background,
  },
  badgeText: { color: colors.onPrimary, fontSize: 11, lineHeight: 13, letterSpacing: 0 },
});
