import { isApiError } from '@/api/client';

export type ErrorMessageKey =
  | 'errors.network'
  | 'errors.rateLimited'
  | 'errors.planLimit'
  | 'errors.invalidCredentials'
  | 'errors.emailTaken'
  | 'errors.alreadySubscribed'
  | 'errors.noBillingAccount'
  | 'errors.billingNotConfigured'
  | 'errors.billingProviderError'
  | 'errors.googleAuthNotConfigured'
  | 'errors.invalidGoogleToken'
  | 'errors.emailNotVerified'
  | 'errors.cannotDemoteSelf'
  | 'errors.cannotDeleteSelf'
  | 'errors.lastAdmin'
  | 'errors.sessionExpired'
  | 'errors.validation'
  | 'errors.forbidden'
  | 'errors.notFound'
  | 'errors.generic';

/** Error codes the backend returns (see the API contract). */
const CODE_TO_KEY: Record<string, ErrorMessageKey> = {
  rate_limited: 'errors.rateLimited',
  plan_limit_reached: 'errors.planLimit',
  invalid_credentials: 'errors.invalidCredentials',
  email_taken: 'errors.emailTaken',
  already_subscribed: 'errors.alreadySubscribed',
  no_billing_account: 'errors.noBillingAccount',
  billing_not_configured: 'errors.billingNotConfigured',
  billing_provider_error: 'errors.billingProviderError',
  google_auth_not_configured: 'errors.googleAuthNotConfigured',
  invalid_google_token: 'errors.invalidGoogleToken',
  email_not_verified: 'errors.emailNotVerified',
  cannot_demote_self: 'errors.cannotDemoteSelf',
  cannot_delete_self: 'errors.cannotDeleteSelf',
  last_admin: 'errors.lastAdmin',
  unauthorized: 'errors.sessionExpired',
  invalid_token: 'errors.sessionExpired',
  token_expired: 'errors.sessionExpired',
  refresh_token_reused: 'errors.sessionExpired',
  refresh_token_expired: 'errors.sessionExpired',
  invalid_refresh_token: 'errors.sessionExpired',
};

/**
 * Maps an error to a localisable message key. Known API error codes get a translated message,
 * then the HTTP status is tried; anything else becomes `errors.generic` (the raw server message
 * is not shown because the server may answer in a different language).
 */
export function getErrorMessageKey(error: unknown): ErrorMessageKey {
  if (!isApiError(error)) return 'errors.generic';
  if (error.isNetworkError) return 'errors.network';
  const byCode = CODE_TO_KEY[error.code];
  if (byCode) return byCode;
  switch (error.status) {
    case 422:
      return 'errors.validation';
    case 429:
      return 'errors.rateLimited';
    case 402:
      return 'errors.planLimit';
    case 403:
      return 'errors.forbidden';
    case 404:
      return 'errors.notFound';
    default:
      return 'errors.generic';
  }
}

export function isPlanLimitError(error: unknown): boolean {
  return isApiError(error) && (error.code === 'plan_limit_reached' || error.status === 402);
}

export function isRateLimitError(error: unknown): boolean {
  return isApiError(error) && (error.code === 'rate_limited' || error.status === 429);
}

/** Checkout attempted while already subscribed: the user should manage the subscription instead. */
export function isAlreadySubscribedError(error: unknown): boolean {
  return isApiError(error) && error.code === 'already_subscribed';
}

/** Whole minutes (at least 1) to wait, from a 429's `Retry-After`; null if the server gave none. */
export function getRetryAfterMinutes(error: unknown): number | null {
  if (!isApiError(error) || error.retryAfterSeconds === null) return null;
  return Math.max(1, Math.ceil(error.retryAfterSeconds / 60));
}
