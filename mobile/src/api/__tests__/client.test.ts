import {
  ApiError,
  buildQueryString,
  createApiClient,
  parseRetryAfter,
  type TokenStore,
  type Tokens,
} from '../client';
import type { AuthResponse } from '../types';

const BASE = 'https://api.test/api/v1';

function jsonResponse(status: number, body?: unknown, headers: Record<string, string> = {}): Response {
  const text = body === undefined ? '' : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `status ${status}`,
    headers: { get: (name: string) => headers[name] ?? null },
    json: async () => JSON.parse(text),
    text: async () => text,
  } as unknown as Response;
}

function authResponse(access: string, refresh: string): AuthResponse {
  return {
    access_token: access,
    refresh_token: refresh,
    token_type: 'bearer',
    expires_in: 900,
    user: { id: 'u1' } as AuthResponse['user'],
  };
}

function memoryStore(initial: Tokens | null): TokenStore & { current: Tokens | null } {
  const store = {
    current: initial,
    get: async () => store.current,
    set: async (tokens: Tokens | null) => {
      store.current = tokens;
    },
  };
  return store;
}

type Call = { url: string; method: string; headers: Record<string, string>; body?: string };

function setup(
  handler: (call: Call, index: number) => Response | Promise<Response>,
  tokens: Tokens | null = { accessToken: 'access-1', refreshToken: 'refresh-1' },
) {
  const calls: Call[] = [];
  const fetchImpl = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const call: Call = {
      url: String(url),
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body as string | undefined,
    };
    calls.push(call);
    return handler(call, calls.length - 1);
  });
  const store = memoryStore(tokens);
  const onAuthLost = jest.fn();
  const onTokensRefreshed = jest.fn();
  const client = createApiClient({
    baseUrl: BASE,
    tokenStore: store,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    onAuthLost,
    onTokensRefreshed,
  });
  return { client, calls, store, onAuthLost, onTokensRefreshed, fetchImpl };
}

describe('buildQueryString', () => {
  it('skips empty values and encodes the rest', () => {
    expect(buildQueryString({ q: 'a b', limit: 20, empty: '', none: undefined, nil: null, flag: false })).toBe(
      '?q=a%20b&limit=20&flag=false',
    );
    expect(buildQueryString({})).toBe('');
    expect(buildQueryString(undefined)).toBe('');
  });
});

describe('parseRetryAfter', () => {
  it('reads seconds and ignores HTTP dates / garbage', () => {
    expect(parseRetryAfter('120')).toBe(120);
    expect(parseRetryAfter(' 1.5 ')).toBe(2);
    expect(parseRetryAfter('Wed, 21 Oct 2026 07:28:00 GMT')).toBeNull();
    expect(parseRetryAfter('-3')).toBeNull();
    expect(parseRetryAfter(null)).toBeNull();
  });
});

describe('createApiClient requests', () => {
  it('sends the bearer token, JSON body and query string, and parses the response', async () => {
    const { client, calls } = setup(() => jsonResponse(200, { ok: true }));
    const result = await client.post<{ ok: boolean }>('/searches', { query: 'x' });

    expect(result).toEqual({ ok: true });
    expect(calls[0].url).toBe(`${BASE}/searches`);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].headers.Authorization).toBe('Bearer access-1');
    expect(calls[0].headers['Content-Type']).toBe('application/json');
    expect(calls[0].body).toBe(JSON.stringify({ query: 'x' }));

    await client.get('/searches', { category: 'immobili', limit: 10 });
    expect(calls[1].url).toBe(`${BASE}/searches?category=immobili&limit=10`);
  });

  it('returns undefined for 204 responses', async () => {
    const { client } = setup(() => jsonResponse(204));
    await expect(client.delete('/searches/1')).resolves.toBeUndefined();
  });

  it('turns the error envelope into an ApiError', async () => {
    const { client } = setup(() =>
      jsonResponse(402, { error: { code: 'plan_limit_reached', message: 'Upgrade needed' } }),
    );
    const error = await client.post('/searches', {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 402, code: 'plan_limit_reached', message: 'Upgrade needed' });
  });

  it('exposes Retry-After (429) and validation details (422) on the ApiError', async () => {
    const limited = setup(() =>
      jsonResponse(429, { error: { code: 'rate_limited', message: 'slow down' } }, { 'Retry-After': '180' }),
    );
    const rateLimited = (await limited.client.post('/searches/1/run').catch((e: unknown) => e)) as ApiError;
    expect(rateLimited.code).toBe('rate_limited');
    expect(rateLimited.retryAfterSeconds).toBe(180);

    const details = [{ loc: ['body', 'email'], msg: 'invalid' }];
    const invalid = setup(() =>
      jsonResponse(422, { error: { code: 'validation_error', message: 'bad', details } }),
    );
    const validation = (await invalid.client.post('/auth/register', {}).catch((e: unknown) => e)) as ApiError;
    expect(validation.status).toBe(422);
    expect(validation.details).toEqual(details);
    expect(validation.retryAfterSeconds).toBeNull();
  });

  it('falls back to a generic code when the error body is not JSON', async () => {
    const { client } = setup(
      () =>
        ({
          ok: false,
          status: 502,
          statusText: 'Bad Gateway',
          json: async () => {
            throw new Error('not json');
          },
          text: async () => '<html>',
        }) as unknown as Response,
    );
    const error = (await client.get('/x').catch((e: unknown) => e)) as ApiError;
    expect(error.status).toBe(502);
    expect(error.code).toBe('http_502');
  });

  it('reports network failures as ApiError with status 0', async () => {
    const { client } = setup(() => {
      throw new TypeError('Network request failed');
    });
    const error = (await client.get('/x').catch((e: unknown) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.isNetworkError).toBe(true);
    expect(error.code).toBe('network_error');
  });

  it('does not send credentials or refresh for auth:false requests', async () => {
    const { client, calls, onAuthLost } = setup(() =>
      jsonResponse(401, { error: { code: 'invalid_credentials', message: 'nope' } }),
    );
    const error = (await client.post('/auth/login', {}, { auth: false }).catch((e: unknown) => e)) as ApiError;

    expect(error.code).toBe('invalid_credentials');
    expect(calls).toHaveLength(1);
    expect(calls[0].headers.Authorization).toBeUndefined();
    expect(onAuthLost).not.toHaveBeenCalled();
  });
});

describe('createApiClient token refresh', () => {
  it('refreshes on 401, stores the rotated pair and replays the request once', async () => {
    const { client, calls, store, onTokensRefreshed } = setup((call) => {
      if (call.url.endsWith('/auth/refresh')) return jsonResponse(200, authResponse('access-2', 'refresh-2'));
      return call.headers.Authorization === 'Bearer access-2'
        ? jsonResponse(200, { id: 'me' })
        : jsonResponse(401, { error: { code: 'token_expired', message: 'expired' } });
    });

    await expect(client.get('/me')).resolves.toEqual({ id: 'me' });

    expect(calls.map((c) => c.url.replace(BASE, ''))).toEqual(['/me', '/auth/refresh', '/me']);
    expect(JSON.parse(calls[1].body ?? '{}')).toEqual({ refresh_token: 'refresh-1' });
    expect(calls[1].headers.Authorization).toBeUndefined();
    expect(store.current).toEqual({ accessToken: 'access-2', refreshToken: 'refresh-2' });
    expect(onTokensRefreshed).toHaveBeenCalledTimes(1);
  });

  it('shares one refresh call between concurrent 401s (single-flight)', async () => {
    let refreshCalls = 0;
    const { client } = setup(async (call) => {
      if (call.url.endsWith('/auth/refresh')) {
        refreshCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return jsonResponse(200, authResponse('access-2', 'refresh-2'));
      }
      return call.headers.Authorization === 'Bearer access-2'
        ? jsonResponse(200, { ok: true })
        : jsonResponse(401, { error: { code: 'token_expired', message: 'expired' } });
    });

    const results = await Promise.all([client.get('/a'), client.get('/b'), client.get('/c')]);

    expect(results).toHaveLength(3);
    expect(refreshCalls).toBe(1);
  });

  it('replays with the current token, without refreshing, if another request already rotated it', async () => {
    const { client, calls, store } = setup((call) => {
      if (call.headers.Authorization === 'Bearer access-1') {
        // While this request was in flight another one refreshed the tokens.
        store.current = { accessToken: 'access-2', refreshToken: 'refresh-2' };
        return jsonResponse(401, { error: { code: 'token_expired', message: 'expired' } });
      }
      return jsonResponse(200, { ok: true });
    });

    await expect(client.get('/me')).resolves.toEqual({ ok: true });
    expect(calls.some((c) => c.url.endsWith('/auth/refresh'))).toBe(false);
    expect(calls[1].headers.Authorization).toBe('Bearer access-2');
  });

  it('clears the tokens and signals auth loss when the refresh token is rejected', async () => {
    const { client, store, onAuthLost } = setup((call) =>
      call.url.endsWith('/auth/refresh')
        ? jsonResponse(401, { error: { code: 'invalid_refresh_token', message: 'bad' } })
        : jsonResponse(401, { error: { code: 'token_expired', message: 'expired' } }),
    );

    const error = (await client.get('/me').catch((e: unknown) => e)) as ApiError;

    expect(error.status).toBe(401);
    expect(store.current).toBeNull();
    expect(onAuthLost).toHaveBeenCalledTimes(1);
  });

  it.each(['refresh_token_reused', 'refresh_token_expired', 'invalid_refresh_token'])(
    'logs out when the refresh endpoint answers %s',
    async (code) => {
      const { client, store, onAuthLost } = setup((call) =>
        call.url.endsWith('/auth/refresh')
          ? jsonResponse(401, { error: { code, message: 'no' } })
          : jsonResponse(401, { error: { code: 'token_expired', message: 'expired' } }),
      );

      await expect(client.get('/me')).rejects.toBeInstanceOf(ApiError);

      expect(store.current).toBeNull();
      expect(onAuthLost).toHaveBeenCalledTimes(1);
    },
  );

  it('keeps the session when the refresh fails because of the network or the server', async () => {
    const { client, store, onAuthLost } = setup((call) =>
      call.url.endsWith('/auth/refresh')
        ? jsonResponse(503, { error: { code: 'unavailable', message: 'down' } })
        : jsonResponse(401, { error: { code: 'token_expired', message: 'expired' } }),
    );

    const error = (await client.get('/me').catch((e: unknown) => e)) as ApiError;

    expect(error.status).toBe(503);
    expect(store.current).toEqual({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    expect(onAuthLost).not.toHaveBeenCalled();
  });

  it('does not loop: a second 401 after a successful refresh is returned to the caller', async () => {
    let refreshCalls = 0;
    const { client } = setup((call) => {
      if (call.url.endsWith('/auth/refresh')) {
        refreshCalls += 1;
        return jsonResponse(200, authResponse('access-2', 'refresh-2'));
      }
      return jsonResponse(401, { error: { code: 'unauthorized', message: 'still no' } });
    });

    const error = (await client.get('/me').catch((e: unknown) => e)) as ApiError;

    expect(error.status).toBe(401);
    expect(refreshCalls).toBe(1);
  });

  it('does not try to refresh when nobody is signed in', async () => {
    const { client, calls } = setup(() => jsonResponse(401, { error: { code: 'unauthorized', message: 'x' } }), null);
    await expect(client.get('/me')).rejects.toBeInstanceOf(ApiError);
    expect(calls).toHaveLength(1);
  });
});
