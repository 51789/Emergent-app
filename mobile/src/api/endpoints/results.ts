import { apiClient } from '../instance';
import type {
  BulkResponse,
  PageParams,
  Paginated,
  Result,
  ResultBulkAction,
  ResultListParams,
  UpdateResultBody,
} from '../types';

export const resultsApi = {
  listForSearch: (searchId: string, params: PageParams = {}) =>
    apiClient.get<Paginated<Result>>(`/searches/${searchId}/results`, { ...params }),
  list: (params: ResultListParams = {}) => apiClient.get<Paginated<Result>>('/results', { ...params }),
  update: (id: string, body: UpdateResultBody) => apiClient.patch<Result>(`/results/${id}`, body),
  remove: (id: string) => apiClient.delete(`/results/${id}`),
  bulk: (ids: string[], action: ResultBulkAction) =>
    apiClient.post<BulkResponse>('/results/bulk', { ids, action }),
  markAllSeen: (searchId?: string) =>
    apiClient.post<BulkResponse>('/results/mark-all-seen', searchId ? { search_id: searchId } : {}),
};
