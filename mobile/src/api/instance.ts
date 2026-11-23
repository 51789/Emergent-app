import { env } from '@/config/env';

import { emitAuthLost, emitSessionRefreshed } from './authEvents';
import { createApiClient } from './client';
import { tokenStore } from './tokenStorage';

/** Application-wide API client. Endpoint modules import this singleton. */
export const apiClient = createApiClient({
  baseUrl: env.apiBaseUrl,
  tokenStore,
  onAuthLost: emitAuthLost,
  onTokensRefreshed: (response) => emitSessionRefreshed(response.user),
});
