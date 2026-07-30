import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { loadToken, saveToken } from './tokenStorage';
import {
  startGoogleSignIn,
  exchangeSessionId,
  readSessionIdFromWindow,
  extractSessionIdFromUrl,
  GoogleSignInResult,
} from './googleAuth';

const API_URL =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL ||
  process.env.EXPO_PUBLIC_BACKEND_URL;

const BASE_URL = `${API_URL}/api`;

export type AuthUser = {
  id: string;
  email: string;
  role: 'admin' | 'user';
  is_active: boolean;
  plan?: string;
  plan_status?: string;
  plan_started_at?: string | null;
  plan_expires_at?: string | null;
  created_at?: string | null;
};

export type AuthState = {
  token: string | null;
  user: AuthUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshMe: () => Promise<void>;
  authFetch: (path: string, init?: RequestInit) => Promise<any>;
};

const AuthCtx = createContext<AuthState | null>(null);

async function jsonFetch(path: string, init: RequestInit = {}, token?: string | null) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init.headers as Record<string, string>) || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = (data && (data.detail || data.message)) || `HTTP ${res.status}`;
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return data;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Helper: apply a Google sign-in result to state + storage
  const applyGoogleResult = useCallback(async (res: GoogleSignInResult) => {
    await saveToken(res.session_token);
    setToken(res.session_token);
    setUser(res.user as AuthUser);
  }, []);

  // On mount, hydrate from persistent storage + handle Google redirect
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // 1) On web: if the URL has `session_id`, process it FIRST to avoid races
        if (Platform.OS === 'web') {
          const sid = readSessionIdFromWindow();
          if (sid) {
            try {
              const r = await exchangeSessionId(sid);
              if (!cancelled) await applyGoogleResult(r);
              return;
            } catch (e) {
              console.warn('Google session exchange failed on web:', e);
              // fall through to try existing token
            }
          }
        }

        // 2) On mobile cold-start: `Linking.getInitialURL()` may contain session_id
        if (Platform.OS !== 'web') {
          try {
            const initial = await Linking.getInitialURL();
            const sid = initial ? extractSessionIdFromUrl(initial) : null;
            if (sid) {
              try {
                const r = await exchangeSessionId(sid);
                if (!cancelled) await applyGoogleResult(r);
                return;
              } catch (e) {
                console.warn('Google session exchange failed on cold-start:', e);
              }
            }
          } catch {
            // ignore
          }
        }

        // 3) Otherwise, hydrate from stored token
        const t = await loadToken();
        if (!t) {
          if (!cancelled) setLoading(false);
          return;
        }
        try {
          const me = await jsonFetch('/auth/me', {}, t);
          if (!cancelled) {
            setToken(t);
            setUser(me);
          }
        } catch {
          // Token invalid — clear it
          await saveToken(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyGoogleResult]);

  const signIn = useCallback(async (email: string, password: string) => {
    const data = await jsonFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    await saveToken(data.access_token);
    setToken(data.access_token);
    setUser(data.user);
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const data = await jsonFetch('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    await saveToken(data.access_token);
    setToken(data.access_token);
    setUser(data.user);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    // On web this triggers a full-page redirect and returns null. When the
    // browser comes back with `?session_id=...` the hydration effect above
    // will pick it up on the next mount.
    // On native the WebBrowser dismisses with a redirect URL we must parse.
    const returnUrl = await startGoogleSignIn();
    if (Platform.OS === 'web') return; // page will navigate
    if (!returnUrl) throw new Error('Google sign-in cancelled');
    const sid = extractSessionIdFromUrl(returnUrl);
    if (!sid) throw new Error('No session_id returned from Google');
    const r = await exchangeSessionId(sid);
    await applyGoogleResult(r);
  }, [applyGoogleResult]);

  const signOut = useCallback(async () => {
    // Best-effort server-side logout for Google sessions
    if (token) {
      try {
        await fetch(`${BASE_URL}/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // ignore network errors on logout
      }
    }
    await saveToken(null);
    setToken(null);
    setUser(null);
  }, [token]);

  const refreshMe = useCallback(async () => {
    if (!token) return;
    try {
      const me = await jsonFetch('/auth/me', {}, token);
      setUser(me);
    } catch {
      // ignore
    }
  }, [token]);

  const authFetch = useCallback(
    async (path: string, init: RequestInit = {}) => {
      return jsonFetch(path, init, token);
    },
    [token]
  );

  return (
    <AuthCtx.Provider
      value={{ token, user, loading, signIn, signUp, signInWithGoogle, signOut, refreshMe, authFetch }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
