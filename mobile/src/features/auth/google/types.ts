export interface GoogleButtonProps {
  /** Called with a Google ID token, to be exchanged with POST /auth/google. */
  onIdToken: (idToken: string) => Promise<void> | void;
  /** Called with a localised, user-facing error message. */
  onError: (message: string) => void;
  disabled?: boolean;
}
