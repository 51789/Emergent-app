import type {
  AdminUserListParams,
  AnalyticsMetric,
  AnalyticsRangeParams,
  ResultListParams,
  SearchListParams,
} from './types';

type WithoutCursor<T> = Omit<T, 'cursor'>;

/**
 * React Query keys, one namespace per resource. Keys are hierarchical so that
 * `invalidateQueries({ queryKey: qk.searches.all })` refreshes every search query.
 */
export const qk = {
  searches: {
    all: ['searches'] as const,
    list: (params: WithoutCursor<SearchListParams>) => ['searches', 'list', params] as const,
    detail: (id: string) => ['searches', 'detail', id] as const,
    counts: ['searches', 'counts'] as const,
  },
  results: {
    all: ['results'] as const,
    bySearch: (searchId: string) => ['results', 'search', searchId] as const,
    list: (params: WithoutCursor<ResultListParams>) => ['results', 'list', params] as const,
  },
  notifications: {
    unseenCount: ['notifications', 'unseen-count'] as const,
  },
  billing: {
    plans: (language: string) => ['billing', 'plans', language] as const,
    me: ['billing', 'me'] as const,
  },
  admin: {
    users: (params: WithoutCursor<AdminUserListParams>) => ['admin', 'users', params] as const,
    usersAll: ['admin', 'users'] as const,
    overview: (range: AnalyticsRangeParams) => ['admin', 'analytics', 'overview', range] as const,
    timeseries: (range: AnalyticsRangeParams, metric: AnalyticsMetric) =>
      ['admin', 'analytics', 'timeseries', range, metric] as const,
    categories: (range: AnalyticsRangeParams) => ['admin', 'analytics', 'categories', range] as const,
  },
} as const;
