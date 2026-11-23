import { QueryClient } from '@tanstack/react-query';

import { isApiError } from './client';

/** Do not retry client errors (4xx) except timeouts / throttling; retry network and 5xx twice. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  if (isApiError(error) && error.status >= 400 && error.status < 500) {
    return error.status === 408 || error.status === 429;
  }
  return true;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      gcTime: 10 * 60_000,
      retry: shouldRetry,
    },
    mutations: { retry: false },
  },
});
