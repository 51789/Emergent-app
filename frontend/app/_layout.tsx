import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { LogBox, Platform, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useFonts } from "expo-font";
import * as Notifications from "expo-notifications";
import * as Linking from "expo-linking";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AnimatedSplash } from "@/src/components/AnimatedSplash";
import { registerForPushNotifications } from "@/src/services/push";


// Disable logbox errors etc so that users can see the app
// and agent works as expected.
LogBox.ignoreAllLogs(true)

// Keep the native splash visible from cold start until icon fonts register.
SplashScreen.preventAutoHideAsync();

// ---------------------------------------------------------------------------
// Push notifications — module-scope setup (MUST run before any component
// mounts, per the Emergent push playbook). Web is guarded because these
// APIs are native-only and crash on web.
// ---------------------------------------------------------------------------
if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

if (Platform.OS === "android") {
  // Fire-and-forget; channel props are frozen once created.
  Notifications.setNotificationChannelAsync("default", {
    name: "Default",
    importance: Notifications.AndroidImportance.MAX,
    sound: "default",
  }).catch(() => {
    // ignore — channel may already exist
  });
}

export default function RootLayout() {
  const router = useRouter();
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
  useEffect(() => {
    const timer = setTimeout(() => {
      setTimedOut(true);
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

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

  // ---------------------------------------------------------------------
  // Push notifications — tap handlers + registration.
  // Runs once after the layout mounts. Web is guarded.
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (Platform.OS === "web") return;

    // Register (or refresh) this device's push token every app open.
    registerForPushNotifications();

    // Warm tap — user taps a notification while the app is running
    const tapSub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = (response.notification.request.content.data || {}) as any;
        const url = data.deeplink || data.action_url || "/notifications";
        if (!url) return;
        if (typeof url === "string" && url.startsWith("http")) {
          Linking.openURL(url).catch(() => {});
        } else {
          router.push(url);
        }
      }
    );

    // Cold-start tap — user tapped a notification while the app was killed
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (!response) return;
        const data = (response.notification.request.content.data || {}) as any;
        const url = data.deeplink || data.action_url;
        if (!url) return;
        if (typeof url === "string" && url.startsWith("http")) {
          Linking.openURL(url).catch(() => {});
        } else {
          router.push(url);
        }
      })
      .catch(() => {});

    // Denied-permission weekly nudge — deep-links to system settings once/week
    (async () => {
      try {
        const { status, canAskAgain } = await Notifications.getPermissionsAsync();
        if (status !== "denied" || canAskAgain) return;
        const lastNudge = await AsyncStorage.getItem("pushNudgeAt");
        const oneWeek = 7 * 24 * 60 * 60 * 1000;
        if (lastNudge && Date.now() - Number(lastNudge) <= oneWeek) return;
        // Persist right away to throttle the nudge, then jump to settings.
        await AsyncStorage.setItem("pushNudgeAt", String(Date.now()));
        Linking.openSettings().catch(() => {});
      } catch {
        // ignore
      }
    })();

    return () => {
      tapSub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
