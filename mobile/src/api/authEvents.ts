import type { User } from './types';

type AuthLostListener = () => void;
type RefreshedListener = (user: User) => void;

const lostListeners = new Set<AuthLostListener>();
const refreshedListeners = new Set<RefreshedListener>();

/** Subscribes to "the session expired and could not be refreshed". Returns an unsubscribe function. */
export function onAuthLost(listener: AuthLostListener): () => void {
  lostListeners.add(listener);
  return () => lostListeners.delete(listener);
}

export function emitAuthLost(): void {
  lostListeners.forEach((listener) => listener());
}

/** Subscribes to token refreshes (the refresh response carries the up-to-date user). */
export function onSessionRefreshed(listener: RefreshedListener): () => void {
  refreshedListeners.add(listener);
  return () => refreshedListeners.delete(listener);
}

export function emitSessionRefreshed(user: User): void {
  refreshedListeners.forEach((listener) => listener(user));
}
