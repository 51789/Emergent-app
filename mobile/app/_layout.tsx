import '@/i18n';
import '@/api/focus';

import { QueryClientProvider } from '@tanstack/react-query';
import { Montserrat_400Regular } from '@expo-google-fonts/montserrat/400Regular';
import { Montserrat_500Medium } from '@expo-google-fonts/montserrat/500Medium';
import { Montserrat_600SemiBold } from '@expo-google-fonts/montserrat/600SemiBold';
import { Montserrat_700Bold } from '@expo-google-fonts/montserrat/700Bold';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { queryClient } from '@/api/queryClient';
import { DialogHost } from '@/components/dialog/DialogHost';
import { BootError } from '@/features/auth/BootError';
import { bootstrapSession, useSession } from '@/features/auth/session';
import { configureNotificationHandling } from '@/features/push/pushToken';
import { usePrefsHydrated } from '@/store/prefs';
import { colors } from '@/theme';

/** On wide web viewports the app stays in a phone-like column; native is always full width. */
const MAX_APP_WIDTH = Platform.OS === 'web' ? 720 : undefined;

void SplashScreen.preventAutoHideAsync();
configureNotificationHandling();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Montserrat_400Regular,
    Montserrat_500Medium,
    Montserrat_600SemiBold,
    Montserrat_700Bold,
  });
  const prefsHydrated = usePrefsHydrated();
  const status = useSession((state) => state.status);
  const isAdmin = useSession((state) => state.user?.role === 'admin');

  useEffect(() => {
    void bootstrapSession();
    if (Platform.OS === 'web' && !__DEV__ && window.isSecureContext && 'serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js').catch(() => {
        console.warn('Offline navigation is unavailable.');
      });
    }
  }, []);

  const ready = (fontsLoaded || !!fontError) && prefsHydrated && status !== 'booting';

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  if (status === 'error') {
    return (
      <>
        <BootError
          onRetry={() => {
            useSession.setState({ status: 'booting' });
            void bootstrapSession();
          }}
        />
        <StatusBar style="dark" />
      </>
    );
  }

  return (
    <GestureHandlerRootView style={styles.outer}>
      <View style={styles.column}>
        <QueryClientProvider client={queryClient}>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
            {/* Auth gate: screens of a group are unreachable (and redirected away from) while the guard is false. */}
            <Stack.Protected guard={status === 'signedOut'}>
              <Stack.Screen name="(auth)" />
            </Stack.Protected>
            <Stack.Protected guard={status === 'signedIn'}>
              <Stack.Screen name="(app)" />
            </Stack.Protected>
            <Stack.Protected guard={status === 'signedIn' && isAdmin}>
              <Stack.Screen name="admin" />
            </Stack.Protected>
          </Stack>
          <DialogHost />
          <StatusBar style="dark" />
        </QueryClientProvider>
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1, backgroundColor: colors.surface },
  column: {
    flex: 1,
    width: '100%',
    maxWidth: MAX_APP_WIDTH,
    alignSelf: 'center',
    backgroundColor: colors.background,
  },
});
