import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { getErrorMessageKey, getRetryAfterMinutes } from '@/utils/errors';

/** Returns a function that turns any thrown error into a localised, user-facing message. */
export function useErrorMessage(): (error: unknown) => string {
  const { t } = useTranslation();
  return useCallback(
    (error: unknown) => {
      const key = getErrorMessageKey(error);
      const minutes = getRetryAfterMinutes(error);
      if (key === 'errors.rateLimited' && minutes !== null) return t('errors.rateLimitedIn', { minutes });
      return t(key);
    },
    [t],
  );
}
