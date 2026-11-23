import { apiClient } from '../instance';
import type {
  AdminCreateUserBody,
  AdminUpdateUserBody,
  AdminUserListParams,
  AnalyticsCategories,
  AnalyticsMetric,
  AnalyticsOverview,
  AnalyticsRangeParams,
  AnalyticsTimeseries,
  Paginated,
  User,
} from '../types';

export const adminApi = {
  listUsers: (params: AdminUserListParams = {}) =>
    apiClient.get<Paginated<User>>('/admin/users', { ...params }),
  createUser: (body: AdminCreateUserBody) => apiClient.post<User>('/admin/users', body),
  updateUser: (id: string, body: AdminUpdateUserBody) => apiClient.patch<User>(`/admin/users/${id}`, body),
  removeUser: (id: string) => apiClient.delete(`/admin/users/${id}`),
  overview: (params: AnalyticsRangeParams) =>
    apiClient.get<AnalyticsOverview>('/admin/analytics/overview', { ...params }),
  timeseries: (params: AnalyticsRangeParams, metric: AnalyticsMetric) =>
    apiClient.get<AnalyticsTimeseries>('/admin/analytics/timeseries', { ...params, metric }),
  categories: (params: AnalyticsRangeParams) =>
    apiClient.get<AnalyticsCategories>('/admin/analytics/categories', { ...params }),
};
