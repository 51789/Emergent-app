/**
 * Web counterpart of `googleSignIn.ts`. On web the sign-in itself happens inside the Google Identity
 * Services button (see `GoogleButton.web.tsx`), so only the shared helpers exist here.
 */
import { env } from '@/config/env';

export class GoogleUnavailableError extends Error {}
export class GoogleNotConfiguredError extends Error {}

export type GoogleSignInResult = { status: 'success'; idToken: string } | { status: 'cancelled' };

export function isGoogleConfigured(): boolean {
  return !!env.googleWebClientId;
}

export async function signInWithGoogle(): Promise<GoogleSignInResult> {
  throw new GoogleUnavailableError('Use the Google Identity Services button on web');
}

interface GoogleIdentity {
  accounts?: { id?: { disableAutoSelect?: () => void } };
}

/** Stops Google from silently re-selecting the previous account after sign-out. */
export async function googleSignOut(): Promise<void> {
  const google = (globalThis as { google?: GoogleIdentity }).google;
  google?.accounts?.id?.disableAutoSelect?.();
}
