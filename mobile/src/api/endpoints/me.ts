import { apiClient } from '../instance';
import type { UpdateMeBody, User } from '../types';

export const meApi = {
  get: () => apiClient.get<User>('/me'),
  update: (body: UpdateMeBody) => apiClient.patch<User>('/me', body),
  remove: () => apiClient.delete('/me'),
};
