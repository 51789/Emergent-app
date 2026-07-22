import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Easing } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

interface NotificationBellProps {
  count: number;
  onPress?: () => void;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({ count, onPress }) => {
  const shake = useRef(new Animated.Value(0)).current;
  const hasNotifications = count > 0;

  useEffect(() => {
    if (!hasNotifications) {
      shake.stopAnimation();
      shake.setValue(0);
      return;
    }

    // Continuous gentle shake loop: -1 -> 1 -> 0, repeating with a rest
    const singleShake = Animated.sequence([
      Animated.timing(shake, {
        toValue: 1,
        duration: 80,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
      Animated.timing(shake, {
        toValue: -1,
        duration: 160,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
      Animated.timing(shake, {
        toValue: 1,
        duration: 160,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
      Animated.timing(shake, {
        toValue: 0,
        duration: 80,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
      Animated.delay(1600),
    ]);

    const loop = Animated.loop(singleShake);
    loop.start();
    return () => loop.stop();
  }, [hasNotifications, shake]);

  const rotate = shake.interpolate({
    inputRange: [-1, 1],
    outputRange: ['-15deg', '15deg'],
  });

  const displayCount = count > 99 ? '99+' : String(count);

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.7}
      testID="notification-bell"
    >
      <Animated.View style={{ transform: [{ rotate }] }}>
        <MaterialIcons
          name={hasNotifications ? 'notifications-active' : 'notifications-none'}
          size={26}
          color={hasNotifications ? '#FF3B30' : '#333'}
        />
      </Animated.View>

      {hasNotifications && (
        <View style={styles.badge} testID="notification-badge">
          <Text style={styles.badgeText} numberOfLines={1}>
            {displayCount}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 8,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 2,
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    borderWidth: 2,
    borderColor: '#FFF',
  },
  badgeText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 13,
  },
});
