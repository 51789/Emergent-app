import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const KEY = 'jarvis.auth_token';

/**
 * Persist the JWT securely.
 * - Native: expo-secure-store (Keychain on iOS, EncryptedSharedPreferences on Android)
 * - Web: AsyncStorage (which maps to localStorage under RNW)
 * Passing null clears it.
 */
export async function saveToken(token: string | null): Promise<void> {
  if (Platform.OS === 'web') {
    if (token) {
      await AsyncStorage.setItem(KEY, token);
    } else {
      await AsyncStorage.removeItem(KEY);
    }
    return;
  }
  if (token) {
    await SecureStore.setItemAsync(KEY, token);
  } else {
    await SecureStore.deleteItemAsync(KEY);
  }
}

export async function loadToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return AsyncStorage.getItem(KEY);
  }
  return SecureStore.getItemAsync(KEY);
}
