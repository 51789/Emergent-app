/**
 * Native Google Sign-In (iOS / Android) through @react-native-google-signin/google-signin.
 *
 * The library is native code, so it is loaded lazily: in Expo Go (which does not ship it) the
 * `require` throws and we report `GoogleUnavailableError` instead of crashing at import time.
 * It works in development builds and store builds (`eas build --profile development`).
 *
 * The web implementation lives in `googleSignIn.web.ts` / `GoogleButton.web.tsx`.
 */
import { env } from '@/config/env';

type GoogleModule = typeof import('@react-native-google-signin/google-signin');

/** The native module is missing from this binary (Expo Go). */
export class GoogleUnavailableError extends Error {
  constructor() {
    super('Google Sign-In native module is not available in this build');
    this.name = 'GoogleUnavailableError';
  }
}

/** The web client id env var is missing, so no ID token can be requested. */
export class GoogleNotConfiguredError extends Error {
  constructor() {
    super('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is not set');
    this.name = 'GoogleNotConfiguredError';
  }
}

export type GoogleSignInResult = { status: 'success'; idToken: string } | { status: 'cancelled' };

let moduleCache: GoogleModule | null | undefined;
let configured = false;

function loadModule(): GoogleModule | null {
  if (moduleCache !== undefined) return moduleCache;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    moduleCache = require('@react-native-google-signin/google-signin') as GoogleModule;
  } catch {
    moduleCache = null;
  }
  return moduleCache;
}

export function isGoogleConfigured(): boolean {
  return !!env.googleWebClientId;
}

/** Opens the native Google account chooser and resolves with a Google ID token for POST /auth/google. */
export async function signInWithGoogle(): Promise<GoogleSignInResult> {
  const google = loadModule();
  if (!google) throw new GoogleUnavailableError();
  if (!env.googleWebClientId) throw new GoogleNotConfiguredError();

  if (!configured) {
    google.GoogleSignin.configure({
      // The *web* client id makes Google issue an ID token the backend can verify.
      webClientId: env.googleWebClientId,
      iosClientId: env.googleIosClientId,
    });
    configured = true;
  }

  try {
    await google.GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await google.GoogleSignin.signIn();
    if (response.type !== 'success') return { status: 'cancelled' };
    const idToken = response.data.idToken;
    if (!idToken) throw new Error('Google did not return an ID token');
    return { status: 'success', idToken };
  } catch (error) {
    if (google.isErrorWithCode(error) && error.code === google.statusCodes.SIGN_IN_CANCELLED) {
      return { status: 'cancelled' };
    }
    throw error;
  }
}

/** Clears the cached Google account so the next sign-in shows the account chooser. Never throws. */
export async function googleSignOut(): Promise<void> {
  if (!configured) return;
  try {
    await loadModule()?.GoogleSignin.signOut();
  } catch {
    // ignore
  }
}
