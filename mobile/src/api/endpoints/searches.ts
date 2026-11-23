import { apiClient } from '../instance';
import type {
  BulkResponse,
  CreateSearchBody,
  Paginated,
  Search,
  SearchBulkAction,
  SearchCounts,
  SearchListParams,
  UpdateSearchBody,
} from '../types';

export const searchesApi = {
  list: (params: SearchListParams = {}) => apiClient.get<Paginated<Search>>('/searches', { ...params }),
  counts: () => apiClient.get<SearchCounts>('/searches/counts'),
  get: (id: string) => apiClient.get<Search>(`/searches/${id}`),
  create: (body: CreateSearchBody) => apiClient.post<Search>('/searches', body),
  update: (id: string, body: UpdateSearchBody) => apiClient.patch<Search>(`/searches/${id}`, body),
  remove: (id: string) => apiClient.delete(`/searches/${id}`),
  /** Starts a run now. Resolves with the search (status pending/running). 429 `rate_limited` if too frequent. */
  run: (id: string) => apiClient.post<Search>(`/searches/${id}/run`),
  bulk: (ids: string[], action: SearchBulkAction) =>
    apiClient.post<BulkResponse>('/searches/bulk', { ids, action }),
};
