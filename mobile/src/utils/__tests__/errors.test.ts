import { ApiError } from '@/api/client';

import {
  getErrorMessageKey,
  getRetryAfterMinutes,
  isAlreadySubscribedError,
  isPlanLimitError,
  isRateLimitError,
} from '../errors';

describe('getErrorMessageKey', () => {
  it('maps known API codes', () => {
    expect(getErrorMessageKey(new ApiError(429, 'rate_limited', ''))).toBe('errors.rateLimited');
    expect(getErrorMessageKey(new ApiError(402, 'plan_limit_reached', ''))).toBe('errors.planLimit');
    expect(getErrorMessageKey(new ApiError(401, 'invalid_credentials', ''))).toBe('errors.invalidCredentials');
    expect(getErrorMessageKey(new ApiError(409, 'email_taken', ''))).toBe('errors.emailTaken');
  });

  it('maps the billing, Google and admin codes of the backend', () => {
    const key = (status: number, code: string) => getErrorMessageKey(new ApiError(status, code, ''));
    expect(key(409, 'already_subscribed')).toBe('errors.alreadySubscribed');
    expect(key(409, 'no_billing_account')).toBe('errors.noBillingAccount');
    expect(key(503, 'billing_not_configured')).toBe('errors.billingNotConfigured');
    expect(key(502, 'billing_provider_error')).toBe('errors.billingProviderError');
    expect(key(503, 'google_auth_not_configured')).toBe('errors.googleAuthNotConfigured');
    expect(key(401, 'invalid_google_token')).toBe('errors.invalidGoogleToken');
    expect(key(401, 'email_not_verified')).toBe('errors.emailNotVerified');
    expect(key(400, 'cannot_demote_self')).toBe('errors.cannotDemoteSelf');
    expect(key(400, 'cannot_delete_self')).toBe('errors.cannotDeleteSelf');
    expect(key(400, 'last_admin')).toBe('errors.lastAdmin');
  });

  it('treats every session-ending 401 code as an expired session', () => {
    for (const code of [
      'unauthorized',
      'invalid_token',
      'token_expired',
      'refresh_token_reused',
      'refresh_token_expired',
      'invalid_refresh_token',
    ]) {
      expect(getErrorMessageKey(new ApiError(401, code, ''))).toBe('errors.sessionExpired');
    }
  });

  it('falls back to the HTTP status, then to a generic message', () => {
    expect(getErrorMessageKey(new ApiError(403, 'whatever', ''))).toBe('errors.forbidden');
    expect(getErrorMessageKey(new ApiError(404, 'whatever', ''))).toBe('errors.notFound');
    expect(getErrorMessageKey(new ApiError(422, 'validation_error', ''))).toBe('errors.validation');
    expect(getErrorMessageKey(new ApiError(500, 'boom', ''))).toBe('errors.generic');
    // A bare 409 is no longer assumed to be a duplicate email.
    expect(getErrorMessageKey(new ApiError(409, 'something_else', ''))).toBe('errors.generic');
    expect(getErrorMessageKey(new Error('x'))).toBe('errors.generic');
  });

  it('recognises network failures', () => {
    expect(getErrorMessageKey(new ApiError(0, 'network_error', ''))).toBe('errors.network');
    expect(getErrorMessageKey(new ApiError(0, 'timeout', ''))).toBe('errors.network');
  });
});

describe('error predicates', () => {
  it('detects plan limit, rate limit and already-subscribed errors', () => {
    expect(isPlanLimitError(new ApiError(402, 'x', ''))).toBe(true);
    expect(isPlanLimitError(new ApiError(400, 'plan_limit_reached', ''))).toBe(true);
    expect(isPlanLimitError(new ApiError(400, 'x', ''))).toBe(false);
    expect(isRateLimitError(new ApiError(429, 'x', ''))).toBe(true);
    expect(isRateLimitError(new Error('x'))).toBe(false);
    expect(isAlreadySubscribedError(new ApiError(409, 'already_subscribed', ''))).toBe(true);
    expect(isAlreadySubscribedError(new ApiError(409, 'no_billing_account', ''))).toBe(false);
  });
});

describe('getRetryAfterMinutes', () => {
  it('rounds Retry-After seconds up to whole minutes (at least 1)', () => {
    const rateLimited = (seconds: number | null) =>
      new ApiError(429, 'rate_limited', '', { retryAfterSeconds: seconds });
    expect(getRetryAfterMinutes(rateLimited(90))).toBe(2);
    expect(getRetryAfterMinutes(rateLimited(300))).toBe(5);
    expect(getRetryAfterMinutes(rateLimited(5))).toBe(1);
    expect(getRetryAfterMinutes(rateLimited(null))).toBeNull();
    expect(getRetryAfterMinutes(new Error('x'))).toBeNull();
  });
});
