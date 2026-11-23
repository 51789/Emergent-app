export interface PollOptions {
  attempts: number;
  intervalMs: number;
}

/**
 * Calls `fn` until `done(value)` is true or the attempts run out, waiting `intervalMs` between calls.
 * Returns the last value. Errors thrown by `fn` count as a failed attempt (payment webhooks can lag,
 * so a transient failure must not abort the confirmation).
 */
export async function pollUntil<T>(
  fn: () => Promise<T>,
  done: (value: T) => boolean,
  { attempts, intervalMs }: PollOptions,
): Promise<T | undefined> {
  let last: T | undefined;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      last = await fn();
      if (done(last)) return last;
    } catch {
      // ignore and retry
    }
    if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return last;
}
