import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { adminApi } from '../endpoints';
import { qk } from '../queryKeys';
import type {
  AdminCreateUserBody,
  AdminUpdateUserBody,
  AnalyticsMetric,
  AnalyticsRangeParams,
} from '../types';

const PAGE_SIZE = 30;
/** Auto-refresh period of the "realtime" analytics range. */
const REALTIME_POLL_MS = 15_000;

export function useAdminUsers(q: string) {
  const params = { q: q || undefined };
  return useInfiniteQuery({
    queryKey: qk.admin.users(params),
    queryFn: ({ pageParam }) => adminApi.listUsers({ ...params, limit: PAGE_SIZE, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    placeholderData: keepPreviousData,
  });
}

export function useCreateAdminUser() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: AdminCreateUserBody) => adminApi.createUser(body),
    onSuccess: () => void client.invalidateQueries({ queryKey: qk.admin.usersAll }),
  });
}

export function useUpdateAdminUser() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: AdminUpdateUserBody }) => adminApi.updateUser(id, body),
    onSuccess: () => void client.invalidateQueries({ queryKey: qk.admin.usersAll }),
  });
}

export function useDeleteAdminUser() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminApi.removeUser(id),
    onSuccess: () => void client.invalidateQueries({ queryKey: qk.admin.usersAll }),
  });
}

function realtimeInterval(range: AnalyticsRangeParams): number | false {
  return range.range === 'realtime' ? REALTIME_POLL_MS : false;
}

export function useAnalyticsOverview(range: AnalyticsRangeParams, enabled = true) {
  return useQuery({
    queryKey: qk.admin.overview(range),
    queryFn: () => adminApi.overview(range),
    refetchInterval: realtimeInterval(range),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useAnalyticsTimeseries(
  range: AnalyticsRangeParams,
  metric: AnalyticsMetric,
  enabled = true,
) {
  return useQuery({
    queryKey: qk.admin.timeseries(range, metric),
    queryFn: () => adminApi.timeseries(range, metric),
    refetchInterval: realtimeInterval(range),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useAnalyticsCategories(range: AnalyticsRangeParams, enabled = true) {
  return useQuery({
    queryKey: qk.admin.categories(range),
    queryFn: () => adminApi.categories(range),
    refetchInterval: realtimeInterval(range),
    placeholderData: keepPreviousData,
    enabled,
  });
}
