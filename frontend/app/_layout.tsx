import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { LogBox, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useFonts } from "expo-font";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AnimatedSplash } from "@/src/components/AnimatedSplash";


// Disable logbox errors etc so that users can see the app
// and agent works as expected.
LogBox.ignoreAllLogs(true)

// Keep the native splash visible from cold start until icon fonts register.
// Required because @expo/vector-icons' componentDidMount fallback fires
// Font.loadAsync against a broken vendor path if any <Icon> mounts before
// the family is registered — which throws on Android Expo Go.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [iconsLoaded, iconsError] = useIconFonts();
  const [interLoaded, interError] = useFonts({
    'Inter-Regular': require('../assets/fonts/Inter-Regular.ttf'),
    'Inter-Medium': require('../assets/fonts/Inter-Medium.ttf'),
    'Inter-Bold': require('../assets/fonts/Inter-Bold.ttf'),
    'Inter-ExtraBold': require('../assets/fonts/Inter-ExtraBold.ttf'),
  });
  const [showSplash, setShowSplash] = useState(true);
  const [timedOut, setTimedOut] = useState(false);

  // Safety timeout: proceed after 3s even if fonts didn't finish loading.
  // This prevents the app from hanging indefinitely on Android Expo Go if
  // font resolution stalls. Fonts fall back to system defaults in that case.
  useEffect(() => {
    const timer = setTimeout(() => {
      setTimedOut(true);
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  // Proceed when: fonts loaded, OR font loading errored, OR timeout expired.
  // Any of these means we should show the app rather than a blank null.
  const iconsReady = iconsLoaded || iconsError;
  const interReady = interLoaded || interError || timedOut;
  const canRender = iconsReady && interReady;

  useEffect(() => {
    if (canRender) {
      SplashScreen.hideAsync().catch(() => {
        // ignore — splash may already be hidden
      });
    }
  }, [canRender]);

  if (!canRender) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <Stack screenOptions={{ headerShown: false }} />
        {showSplash && (
          <AnimatedSplash onFinish={() => setShowSplash(false)} />
        )}
      </View>
    </GestureHandlerRootView>
  );
}
