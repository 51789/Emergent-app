import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { TokenStore, Tokens } from './client';

const ACCESS_KEY = 'consulens.access_token';
const REFRESH_KEY = 'consulens.refresh_token';

/**
 * Token persistence: Keychain/Keystore via expo-secure-store on native,
 * `localStorage` on web (SecureStore is not available there).
 * Tokens are stored under two keys because SecureStore values are limited to ~2KB.
 */
const backend = {
  async read(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      try {
        return globalThis.localStorage?.getItem(key) ?? null;
      } catch {
        return null;
      }
    }
    return SecureStore.getItemAsync(key);
  },
  async write(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      try {
        globalThis.localStorage?.setItem(key, value);
      } catch {
        // Storage disabled (private mode): the session just will not survive a reload.
      }
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },
  async remove(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      try {
        globalThis.localStorage?.removeItem(key);
      } catch {
        // ignore
      }
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};

/** `undefined` = not loaded from storage yet. */
let cache: Tokens | null | undefined;

export const tokenStore: TokenStore = {
  async get() {
    if (cache !== undefined) return cache;
    const [accessToken, refreshToken] = await Promise.all([
      backend.read(ACCESS_KEY),
      backend.read(REFRESH_KEY),
    ]);
    cache = accessToken && refreshToken ? { accessToken, refreshToken } : null;
    return cache;
  },
  async set(tokens) {
    cache = tokens;
    if (tokens) {
      await Promise.all([
        backend.write(ACCESS_KEY, tokens.accessToken),
        backend.write(REFRESH_KEY, tokens.refreshToken),
      ]);
    } else {
      await Promise.all([backend.remove(ACCESS_KEY), backend.remove(REFRESH_KEY)]);
    }
  },
};
