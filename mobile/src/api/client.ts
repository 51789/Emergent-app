import type { ApiErrorBody, AuthResponse } from './types';

/** Error thrown for every failed API call. `status === 0` means the network request itself failed. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  /** Seconds from the `Retry-After` header (429 responses), when present. */
  readonly retryAfterSeconds: number | null;
  /** `error.details` of 422 validation errors. */
  readonly details: unknown;

  constructor(
    status: number,
    code: string,
    message: string,
    extras: { retryAfterSeconds?: number | null; details?: unknown } = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = extras.retryAfterSeconds ?? null;
    this.details = extras.details;
  }

  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

/** Where the client persists the token pair. Injected so the client stays testable. */
export interface TokenStore {
  get(): Promise<Tokens | null>;
  set(tokens: Tokens | null): Promise<void>;
}

export type QueryValue = string | number | boolean | null | undefined;
export type QueryParams = Record<string, QueryValue>;

export interface RequestOptions {
  query?: QueryParams;
  body?: unknown;
  /** Send the bearer token and refresh it on 401. Defaults to true. */
  auth?: boolean;
  signal?: AbortSignal;
}

export interface ApiClientConfig {
  /** Absolute base URL including the version prefix, e.g. `https://api.example.com/api/v1`. */
  baseUrl: string;
  tokenStore: TokenStore;
  fetchImpl?: typeof fetch;
  /** Called when the refresh token was rejected: the user must sign in again. */
  onAuthLost?: () => void;
  /** Called after every successful token refresh (the response carries the fresh `user`). */
  onTokensRefreshed?: (response: AuthResponse) => void;
  timeoutMs?: number;
}

export interface ApiClient {
  request<T>(method: string, path: string, options?: RequestOptions): Promise<T>;
  get<T>(path: string, query?: QueryParams, signal?: AbortSignal): Promise<T>;
  post<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'body'>): Promise<T>;
  patch<T>(path: string, body?: unknown): Promise<T>;
  delete<T = void>(path: string): Promise<T>;
}

const DEFAULT_TIMEOUT_MS = 30_000;

export function buildQueryString(query?: QueryParams): string {
  if (!query) return '';
  const parts: string[] = [];
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: string }).name === 'AbortError';
}

/** Parses a `Retry-After` header given in seconds (HTTP dates are ignored). */
export function parseRetryAfter(value: string | null | undefined): number | null {
  if (!value) return null;
  const seconds = Number(value.trim());
  return Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds) : null;
}

async function parseError(response: Response): Promise<ApiError> {
  let code = `http_${response.status}`;
  let message = response.statusText || `HTTP ${response.status}`;
  let details: unknown;
  try {
    const data = (await response.json()) as Partial<ApiErrorBody>;
    if (data?.error) {
      code = data.error.code || code;
      message = data.error.message || message;
      details = data.error.details;
    }
  } catch {
    // Non-JSON error body (proxy page, empty response): keep the generic values.
  }
  return new ApiError(response.status, code, message, {
    retryAfterSeconds: parseRetryAfter(response.headers?.get?.('Retry-After')),
    details,
  });
}

/**
 * Creates the HTTP client used by every endpoint module.
 *
 * Auth behaviour:
 * - authenticated requests carry `Authorization: Bearer <access>`;
 * - on 401 the client refreshes the token pair (rotating refresh token) and replays the request once;
 * - concurrent 401s share a single refresh call ("single-flight");
 * - a request that was sent with a stale token while another request already refreshed
 *   is replayed with the current token without triggering a second refresh;
 * - if the refresh token is rejected (any 4xx, e.g. refresh_token_reused / refresh_token_expired /
 *   invalid_refresh_token) the stored tokens are cleared and `onAuthLost` fires (back to login);
 * - refresh tokens are single-use and reuse revokes the session, hence the single-flight below;
 * - network / 5xx failures during refresh keep the tokens so the user stays signed in offline.
 */
export function createApiClient(config: ApiClientConfig): ApiClient {
  const { baseUrl, tokenStore, onAuthLost, onTokensRefreshed } = config;
  const fetchImpl = config.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let refreshInFlight: Promise<Tokens | null> | null = null;

  async function send<T>(
    method: string,
    path: string,
    options: RequestOptions,
    accessToken: string | undefined,
  ): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const onExternalAbort = () => controller.abort();
    options.signal?.addEventListener('abort', onExternalAbort);

    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}${buildQueryString(options.query)}`, {
        method,
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });
    } catch (error) {
      if (isAbortError(error) && options.signal?.aborted) throw error;
      const message = isAbortError(error) ? 'Request timed out' : 'Network request failed';
      throw new ApiError(0, isAbortError(error) ? 'timeout' : 'network_error', message);
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', onExternalAbort);
    }

    if (!response.ok) throw await parseError(response);
    if (response.status === 204) return undefined as T;

    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  async function performRefresh(): Promise<Tokens | null> {
    const current = await tokenStore.get();
    if (!current) return null;
    try {
      const data = await send<AuthResponse>(
        'POST',
        '/auth/refresh',
        { body: { refresh_token: current.refreshToken } },
        undefined,
      );
      const next: Tokens = { accessToken: data.access_token, refreshToken: data.refresh_token };
      await tokenStore.set(next);
      onTokensRefreshed?.(data);
      return next;
    } catch (error) {
      if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
        await tokenStore.set(null);
        onAuthLost?.();
        return null;
      }
      throw error;
    }
  }

  function refreshTokens(): Promise<Tokens | null> {
    if (!refreshInFlight) {
      refreshInFlight = performRefresh().finally(() => {
        refreshInFlight = null;
      });
    }
    return refreshInFlight;
  }

  async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    const useAuth = options.auth ?? true;
    const tokens = useAuth ? await tokenStore.get() : null;

    try {
      return await send<T>(method, path, options, tokens?.accessToken);
    } catch (error) {
      const unauthorized = error instanceof ApiError && error.status === 401;
      if (!useAuth || !tokens || !unauthorized) throw error;

      const latest = await tokenStore.get();
      let accessToken: string | undefined;
      if (latest && latest.accessToken !== tokens.accessToken) {
        accessToken = latest.accessToken;
      } else {
        accessToken = (await refreshTokens())?.accessToken;
      }
      if (!accessToken) throw error;
      return send<T>(method, path, options, accessToken);
    }
  }

  return {
    request,
    get: (path, query, signal) => request('GET', path, { query, signal }),
    post: (path, body, options) => request('POST', path, { ...options, body }),
    patch: (path, body) => request('PATCH', path, { body }),
    delete: (path) => request('DELETE', path),
  };
}
