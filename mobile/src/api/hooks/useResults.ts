import { useInfiniteQuery, useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';

import { patchResultInCaches, removeResultsFromCaches, type InfinitePage } from '../cache';
import { resultsApi } from '../endpoints';
import { qk } from '../queryKeys';
import type { Result, ResultBulkAction, ResultListParams } from '../types';

const PAGE_SIZE = 20;

export function useSearchResults(searchId: string | undefined) {
  return useInfiniteQuery({
    queryKey: qk.results.bySearch(searchId ?? ''),
    queryFn: ({ pageParam }) =>
      resultsApi.listForSearch(searchId as string, { limit: PAGE_SIZE, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    enabled: !!searchId,
  });
}

/** Cross-search result list: favorites, unseen (notifications), optionally by category. */
export function useResultList(params: Omit<ResultListParams, 'cursor' | 'limit'>) {
  return useInfiniteQuery({
    queryKey: qk.results.list(params),
    queryFn: ({ pageParam }) => resultsApi.list({ ...params, limit: PAGE_SIZE, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });
}

type Snapshot = [QueryKey, InfinitePage<Result> | undefined][];

/** Star / unstar a result. The UI flips immediately and rolls back on error. */
export function useToggleFavorite() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isFavorite }: { id: string; isFavorite: boolean }) =>
      resultsApi.update(id, { is_favorite: isFavorite }),
    onMutate: async ({ id, isFavorite }) => {
      await client.cancelQueries({ queryKey: qk.results.all });
      const snapshot: Snapshot = client.getQueriesData<InfinitePage<Result>>({
        queryKey: qk.results.all,
      });
      patchResultInCaches(client, id, { is_favorite: isFavorite });
      return { snapshot };
    },
    onError: (_error, _vars, context) => {
      context?.snapshot.forEach(([key, data]) => client.setQueryData(key, data));
    },
    onSettled: () => void client.invalidateQueries({ queryKey: qk.results.all }),
  });
}

/** Marks a single result as seen and keeps the counters in sync. */
export function useMarkResultSeen() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => resultsApi.update(id, { seen: true }),
    onMutate: (id) => patchResultInCaches(client, id, { seen: true }),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: qk.notifications.unseenCount });
      void client.invalidateQueries({ queryKey: qk.searches.all });
    },
  });
}

/** Marks everything (or everything of one search) as seen. */
export function useMarkAllSeen() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (searchId?: string) => resultsApi.markAllSeen(searchId),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: qk.notifications.unseenCount });
      void client.invalidateQueries({ queryKey: qk.searches.all });
      void client.invalidateQueries({ queryKey: qk.results.list({ unseen: true }) });
    },
  });
}

export function useBulkResults() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, action }: { ids: string[]; action: ResultBulkAction }) =>
      resultsApi.bulk(ids, action),
    onSuccess: (_data, { ids, action }) => {
      if (action === 'delete') removeResultsFromCaches(client, ids);
      void client.invalidateQueries({ queryKey: qk.results.all });
      void client.invalidateQueries({ queryKey: qk.searches.all });
      void client.invalidateQueries({ queryKey: qk.notifications.unseenCount });
    },
  });
}
