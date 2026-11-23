import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

import { notificationsApi } from '@/api/endpoints';
import type { PushPlatform } from '@/api/types';
import { env } from '@/config/env';
import { usePrefs } from '@/store/prefs';

type NotificationsModule = typeof import('expo-notifications');

/**
 * Remote push needs a native build: it does not exist on web, and Expo Go dropped it on
 * Android with SDK 53. In those environments every function here is a harmless no-op.
 */
export function isPushSupported(): boolean {
  if (Platform.OS === 'web') return false;
  if (Platform.OS === 'android' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return false;
  }
  return true;
}

let moduleCache: NotificationsModule | null | undefined;

/** Lazily loads expo-notifications (importing it in unsupported environments logs errors). */
export function getNotifications(): NotificationsModule | null {
  if (moduleCache !== undefined) return moduleCache;
  if (!isPushSupported()) {
    moduleCache = null;
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    moduleCache = require('expo-notifications') as NotificationsModule;
  } catch {
    moduleCache = null;
  }
  return moduleCache;
}

/** Foreground presentation + Android channel. Call once at startup, before any notification arrives. */
export function configureNotificationHandling(): void {
  const Notifications = getNotifications();
  if (!Notifications) return;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS === 'android') {
    void Notifications.setNotificationChannelAsync('default', {
      name: 'Consulens',
      importance: Notifications.AndroidImportance.HIGH,
    }).catch(() => undefined);
  }
}

function resolveProjectId(): string | undefined {
  const fromConfig = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas
    ?.projectId;
  return fromConfig ?? Constants.easConfig?.projectId ?? env.easProjectId;
}

/**
 * Asks for permission, obtains the Expo push token and registers it with the backend.
 * Safe to call on every launch (the backend upserts). Never throws.
 * Returns the token, or null if push is unavailable / denied / not configured.
 */
export async function registerPushToken(): Promise<string | null> {
  const Notifications = getNotifications();
  if (!Notifications || !Device.isDevice) return null;

  try {
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') return null;

    const projectId = resolveProjectId();
    if (!projectId) {
      console.warn('Push disabled: set EXPO_PUBLIC_EAS_PROJECT_ID (run `eas init`).');
      return null;
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await notificationsApi.registerPushToken(token, Platform.OS as PushPlatform);
    usePrefs.getState().setPushToken(token);
    return token;
  } catch (error) {
    console.warn('Push registration failed:', error);
    return null;
  }
}

/** Removes this device's token from the backend (call before the access token is discarded). */
export async function unregisterPushToken(): Promise<void> {
  const token = usePrefs.getState().pushToken;
  if (!token) return;
  try {
    await notificationsApi.unregisterPushToken(token);
  } finally {
    usePrefs.getState().setPushToken(null);
  }
}
