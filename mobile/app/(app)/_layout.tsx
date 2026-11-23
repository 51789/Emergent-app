import { Stack } from 'expo-router';

import { usePushNotifications } from '@/features/push/usePushNotifications';

export const unstable_settings = { anchor: '(tabs)' };

/** Authenticated area: tabs + detail screens pushed on top of them. */
export default function AppLayout() {
  usePushNotifications();
  return <Stack screenOptions={{ headerShown: false }} />;
}
