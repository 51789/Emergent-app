import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import Constants from 'expo-constants';

/**
 * Emergent-managed Google Sign-In helpers.
 *
 * Flow
 * ----
 *   startGoogleSignIn()
 *   → user is redirected to https://auth.emergentagent.com/?redirect=<url>
 *   → after Google, the browser comes back with `session_id=<one-time>` in
 *     the URL (query on mobile, hash on web).
 *   → the caller resolves `session_id` (either from the WebBrowser result on
 *     native or from window.location on web) and passes it to
 *     `exchangeSessionId()` which:
 *       1. Calls Emergent's session-data API to swap for a session_token.
 *       2. POSTs the session_token to our backend, which upserts the user and
 *          persists the session.
 *       3. Returns `{ session_token, user }` for the AuthProvider to store.
 */

const EMERGENT_AUTH_URL = 'https://auth.emergentagent.com/';
const EMERGENT_SESSION_URL =
  'https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data';

const API_URL =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL ||
  process.env.EXPO_PUBLIC_BACKEND_URL;
const BASE_URL = `${API_URL}/api`;

export interface EmergentSessionData {
  id: string;
  email: string;
  name?: string;
  picture?: string;
  session_token: string;
}

export interface GoogleSignInResult {
  session_token: string;
  user: {
    id: string;
    email: string;
    role: 'admin' | 'user';
    is_active: boolean;
    plan?: string;
    plan_status?: string;
    plan_expires_at?: string | null;
    name?: string;
    picture?: string;
  };
}

/** Returns the URL to send the user back to after Google auth. */
export function getRedirectUrl(): string {
  if (Platform.OS === 'web') {
    // On web the redirect MUST point to an existing route in the router.
    // We use '/' which maps to index.tsx.
    return typeof window !== 'undefined' ? `${window.location.origin}/` : '/';
  }
  // On mobile: Expo Go → exp://.../--/  |  standalone → myapp://
  return Linking.createURL('');
}

/** Parse a `session_id` from either a URL hash or query string. */
export function extractSessionIdFromUrl(url: string): string | null {
  if (!url) return null;
  try {
    // Prefer the URL API when available (web + modern RN)
    const u = new URL(url);
    const q = u.searchParams.get('session_id');
    if (q) return q;
    // Hash fragment: `#session_id=xxxx` or `#/?session_id=xxxx`
    const hash = (u.hash || '').replace(/^#\/?/, '');
    if (hash) {
      const params = new URLSearchParams(hash.startsWith('?') ? hash.slice(1) : hash);
      const h = params.get('session_id');
      if (h) return h;
    }
    return null;
  } catch {
    // Fallback: regex
    const match = url.match(/[?#&]session_id=([^&]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }
}

/**
 * Begin the Google sign-in flow.
 * - On web: full-page redirect (returns void; the page navigates away).
 * - On native: opens an in-app browser and returns the redirect URL that
 *   Emergent came back with (containing `session_id`), or null if cancelled.
 */
export async function startGoogleSignIn(): Promise<string | null> {
  const redirectUrl = getRedirectUrl();
  const authUrl = `${EMERGENT_AUTH_URL}?redirect=${encodeURIComponent(redirectUrl)}`;

  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      window.location.href = authUrl;
    }
    return null;
  }

  const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
  if (result.type === 'success' && result.url) {
    return result.url;
  }
  return null;
}

/**
 * Exchange a one-time `session_id` for a persistent app session.
 * 1. Call Emergent session-data API with `X-Session-ID`.
 * 2. Send the resulting `session_token` to our backend to be verified and
 *    persisted alongside the local user.
 */
export async function exchangeSessionId(
  sessionId: string
): Promise<GoogleSignInResult> {
  const emergentRes = await fetch(EMERGENT_SESSION_URL, {
    method: 'GET',
    headers: { 'X-Session-ID': sessionId },
  });
  if (!emergentRes.ok) {
    throw new Error(`Auth provider rejected session_id (${emergentRes.status})`);
  }
  const emergent: EmergentSessionData = await emergentRes.json();
  if (!emergent.session_token) {
    throw new Error('Missing session_token in provider response');
  }

  // Now hand it to our backend which verifies again + upserts the user.
  const appRes = await fetch(`${BASE_URL}/auth/google/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_token: emergent.session_token }),
  });
  if (!appRes.ok) {
    const t = await appRes.text().catch(() => '');
    throw new Error(`Backend rejected session_token: ${t || appRes.status}`);
  }
  const data = await appRes.json();
  return {
    session_token: data.access_token,
    user: data.user,
  };
}

/**
 * Convenience: on web, look at window.location for a lingering `session_id`
 * left there by the redirect. Returns null if nothing to process. Also cleans
 * the URL fragment after reading so the id isn't re-used.
 */
export function readSessionIdFromWindow(): string | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const fromHash = extractSessionIdFromUrl(
    window.location.hash ? `x://x/${window.location.hash}` : ''
  );
  const fromQuery = extractSessionIdFromUrl(window.location.href);
  const id = fromHash || fromQuery;
  if (id) {
    try {
      window.history.replaceState(null, '', window.location.pathname);
    } catch {
      // ignore
    }
  }
  return id;
}
