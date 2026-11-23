import { create } from 'zustand';

import { onAuthLost, onSessionRefreshed } from '@/api/authEvents';
import { isApiError } from '@/api/client';
import { authApi, meApi } from '@/api/endpoints';
import { queryClient } from '@/api/queryClient';
import { tokenStore } from '@/api/tokenStorage';
import type { AuthResponse, LoginBody, RegisterBody, UpdateMeBody, User } from '@/api/types';
import { unregisterPushToken } from '@/features/push/pushToken';
import { usePrefs } from '@/store/prefs';

import { googleSignOut } from './google/googleSignIn';

export type SessionStatus = 'booting' | 'signedOut' | 'signedIn' | 'error';

interface SessionState {
  status: SessionStatus;
  user: User | null;
  setSignedIn: (user: User) => void;
  setUser: (user: User) => void;
  setSignedOut: () => void;
  setBootError: () => void;
}

/** Authentication state. Tokens live in secure storage; this holds who is signed in. */
export const useSession = create<SessionState>((set) => ({
  status: 'booting',
  user: null,
  setSignedIn: (user) => set({ status: 'signedIn', user }),
  setUser: (user) => set({ user }),
  setSignedOut: () => set({ status: 'signedOut', user: null }),
  setBootError: () => set({ status: 'error', user: null }),
}));

// The API client reports an unrecoverable session (refresh token rejected) or a refreshed user.
onAuthLost(() => {
  queryClient.clear();
  useSession.getState().setSignedOut();
});
onSessionRefreshed((user) => {
  if (useSession.getState().status === 'signedIn') useSession.getState().setUser(user);
});

/** The server stores language and voice gender per user: adopt them locally after sign-in. */
function adoptServerPreferences(user: User): void {
  const prefs = usePrefs.getState();
  prefs.setLanguage(user.language);
  prefs.setVoiceGender(user.voice_gender);
}

async function establishSession(response: AuthResponse): Promise<User> {
  await tokenStore.set({ accessToken: response.access_token, refreshToken: response.refresh_token });
  queryClient.clear();
  adoptServerPreferences(response.user);
  useSession.getState().setSignedIn(response.user);
  return response.user;
}

/** Called once at startup: restores the session from secure storage. */
export async function bootstrapSession(): Promise<void> {
  const tokens = await tokenStore.get();
  if (!tokens) {
    useSession.getState().setSignedOut();
    return;
  }
  try {
    const user = await meApi.get();
    adoptServerPreferences(user);
    useSession.getState().setSignedIn(user);
  } catch (error) {
    if (isApiError(error) && !error.isNetworkError && error.status < 500) {
      // Credentials are no longer valid (the client already cleared them if the refresh failed).
      await tokenStore.set(null);
      useSession.getState().setSignedOut();
    } else {
      useSession.getState().setBootError();
    }
  }
}

export async function signInWithPassword(body: LoginBody): Promise<User> {
  return establishSession(await authApi.login(body));
}

export async function registerWithPassword(body: RegisterBody): Promise<User> {
  return establishSession(await authApi.register(body));
}

export async function signInWithGoogleIdToken(idToken: string): Promise<User> {
  return establishSession(await authApi.google(idToken));
}

async function clearLocalSession(): Promise<void> {
  await tokenStore.set(null);
  await googleSignOut();
  queryClient.clear();
  useSession.getState().setSignedOut();
}

/** Signs out: removes this device's push token, revokes the refresh token, wipes local state. */
export async function signOut(): Promise<void> {
  const tokens = await tokenStore.get();
  // Best effort: neither failure should prevent the user from signing out.
  await unregisterPushToken().catch(() => undefined);
  if (tokens) await authApi.logout(tokens.refreshToken).catch(() => undefined);
  await clearLocalSession();
}

/** Permanently deletes the account on the server, then clears the local session. */
export async function deleteAccount(): Promise<void> {
  await meApi.remove();
  await clearLocalSession();
}

/** Updates the profile on the server and mirrors the result in the session. */
export async function updateProfile(body: UpdateMeBody): Promise<User> {
  const user = await meApi.update(body);
  useSession.getState().setUser(user);
  return user;
}

/** Re-reads the current user (e.g. after a plan change). Errors are swallowed: the cached user stays. */
export async function refreshUser(): Promise<void> {
  try {
    useSession.getState().setUser(await meApi.get());
  } catch {
    // keep the cached user
  }
}
