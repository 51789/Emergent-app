import { apiClient } from '../instance';
import type { PushPlatform, UnseenCount } from '../types';

export const notificationsApi = {
  unseenCount: () => apiClient.get<UnseenCount>('/notifications/unseen-count'),
  registerPushToken: (token: string, platform: PushPlatform) =>
    apiClient.post<void>('/push-tokens', { token, platform }),
  unregisterPushToken: (token: string) => apiClient.delete(`/push-tokens/${encodeURIComponent(token)}`),
};
