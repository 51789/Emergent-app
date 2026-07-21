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
  const [interLoaded] = useFonts({
    'Inter-Regular': require('../assets/fonts/Inter-Regular.ttf'),
    'Inter-Medium': require('../assets/fonts/Inter-Medium.ttf'),
    'Inter-Bold': require('../assets/fonts/Inter-Bold.ttf'),
    'Inter-ExtraBold': require('../assets/fonts/Inter-ExtraBold.ttf'),
  });
  const [showSplash, setShowSplash] = useState(true);

  const fontsReady = (iconsLoaded || iconsError) && interLoaded;

  useEffect(() => {
    if (fontsReady) {
      SplashScreen.hideAsync();
    }
  }, [fontsReady]);

  if (!fontsReady) return null;

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
