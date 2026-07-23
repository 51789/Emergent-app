import Constants from 'expo-constants';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

const API_URL =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL ||
  process.env.EXPO_PUBLIC_BACKEND_URL;

const BASE_URL = `${API_URL}/api`;

const USER_ID_KEY = 'jarvis.user_id';

/**
 * Stable per-device user id. This app has no auth, so we generate one on
 * first launch and persist it. All future pushes target this id.
 */
export async function getOrCreateUserId(): Promise<string> {
  let uid = await AsyncStorage.getItem(USER_ID_KEY);
  if (!uid) {
    uid =
      'device-' +
      Date.now().toString(36) +
      '-' +
      Math.random().toString(36).slice(2, 10);
    await AsyncStorage.setItem(USER_ID_KEY, uid);
  }
  return uid;
}

/**
 * Requests notification permission, obtains the native FCM/APNs token, and
 * relays it to the backend so future events can push to this device.
 *
 * Safe to call on every app open — the backend upsert is idempotent.
 * Never throws — errors are logged and swallowed so app startup is unaffected.
 */
export async function registerForPushNotifications(): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    const { status: existing, canAskAgain } =
      await Notifications.getPermissionsAsync();

    let status = existing;
    if (status !== 'granted' && canAskAgain) {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') {
      return;
    }

    // Native FCM/APNs token via SuprSend relay (NOT Expo push token)
    const tokenResp = await Notifications.getDevicePushTokenAsync();
    const deviceToken = tokenResp.data;
    if (!deviceToken) return;

    const userId = await getOrCreateUserId();

    await fetch(`${BASE_URL}/register-push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        platform: Platform.OS,
        device_token: deviceToken,
      }),
    });
  } catch (err) {
    // Silent — never block the app on push registration failures
    console.warn('registerForPushNotifications failed:', err);
  }
}
