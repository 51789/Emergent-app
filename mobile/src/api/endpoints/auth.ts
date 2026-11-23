import { apiClient } from '../instance';
import type { AuthResponse, LoginBody, RegisterBody } from '../types';

export const authApi = {
  register: (body: RegisterBody) =>
    apiClient.post<AuthResponse>('/auth/register', body, { auth: false }),
  login: (body: LoginBody) => apiClient.post<AuthResponse>('/auth/login', body, { auth: false }),
  google: (idToken: string) =>
    apiClient.post<AuthResponse>('/auth/google', { id_token: idToken }, { auth: false }),
  logout: (refreshToken: string) =>
    apiClient.post<void>('/auth/logout', { refresh_token: refreshToken }, { auth: false }),
};
