import { MaterialIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useUnseenCount } from '@/api/hooks';
import type { IconName } from '@/constants/icons';
import { colors, fonts } from '@/theme';

function tabIcon(name: IconName) {
  // eslint-disable-next-line react/display-name
  return ({ color, size }: { color: ColorValue; size: number }) => (
    <MaterialIcons name={name} size={size} color={color as string} />
  );
}

export default function TabsLayout() {
  const { t } = useTranslation();
  const { data: unseen = 0 } = useUnseenCount();
  // Explicit height so icon + label always fit (the default clipped label descenders on web),
  // plus the bottom safe-area inset on devices with a home indicator.
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 8);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 11, lineHeight: 14 },
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          height: 58 + bottomPad,
          paddingTop: 6,
          paddingBottom: bottomPad,
        },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('tabs.home'), tabBarIcon: tabIcon('home') }} />
      <Tabs.Screen name="favorites" options={{ title: t('tabs.favorites'), tabBarIcon: tabIcon('star') }} />
      <Tabs.Screen
        name="notifications"
        options={{
          title: t('tabs.notifications'),
          tabBarIcon: tabIcon('notifications'),
          tabBarBadge: unseen > 0 ? (unseen > 99 ? '99+' : unseen) : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.alert, color: colors.onPrimary },
        }}
      />
      <Tabs.Screen name="settings" options={{ title: t('tabs.settings'), tabBarIcon: tabIcon('settings') }} />
    </Tabs>
  );
}
