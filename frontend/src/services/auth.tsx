import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import Constants from 'expo-constants';
import { loadToken, saveToken } from './tokenStorage';

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

  // On mount, hydrate from persistent storage
  useEffect(() => {
    (async () => {
      try {
        const t = await loadToken();
        if (!t) {
          setLoading(false);
          return;
        }
        try {
          const me = await jsonFetch('/auth/me', {}, t);
          setToken(t);
          setUser(me);
        } catch {
          // Token invalid — clear it
          await saveToken(null);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

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

  const signOut = useCallback(async () => {
    await saveToken(null);
    setToken(null);
    setUser(null);
  }, []);

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
      value={{ token, user, loading, signIn, signUp, signOut, refreshMe, authFetch }}
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
