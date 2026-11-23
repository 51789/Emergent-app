import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { isSearchBusy } from '@/utils/searchStatus';

import { patchSearchInCaches, removeSearchesFromCaches } from '../cache';
import { searchesApi } from '../endpoints';
import { qk } from '../queryKeys';
import type { CreateSearchBody, Search, SearchBulkAction, SearchListParams } from '../types';

const PAGE_SIZE = 30;
/** Poll interval while a run is pending/running. */
const POLL_MS = 3000;
/** Poll interval of the lightweight counters shown on the home screen. */
const COUNTS_POLL_MS = 30_000;

export function useSearchList(params: Omit<SearchListParams, 'cursor' | 'limit'> = {}) {
  return useInfiniteQuery({
    queryKey: qk.searches.list(params),
    queryFn: ({ pageParam }) => searchesApi.list({ ...params, limit: PAGE_SIZE, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    placeholderData: keepPreviousData,
  });
}

/** A single search. Polls while its last run is pending/running. */
export function useSearch(id: string | undefined) {
  return useQuery({
    queryKey: qk.searches.detail(id ?? ''),
    queryFn: () => searchesApi.get(id as string),
    enabled: !!id,
    refetchInterval: (query) => (isSearchBusy(query.state.data) ? POLL_MS : false),
  });
}

export function useSearchCounts() {
  return useQuery({
    queryKey: qk.searches.counts,
    queryFn: searchesApi.counts,
    refetchInterval: COUNTS_POLL_MS,
  });
}

export function useCreateSearch() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateSearchBody) => searchesApi.create(body),
    onSuccess: (created) => {
      client.setQueryData<Search>(qk.searches.detail(created.id), created);
      void client.invalidateQueries({ queryKey: qk.searches.all });
    },
  });
}

/** Pause / resume a search, optimistically. */
export function useToggleSearchActive() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      searchesApi.update(id, { is_active: isActive }),
    onMutate: async ({ id, isActive }) => {
      await client.cancelQueries({ queryKey: qk.searches.all });
      const previous = client.getQueryData<Search>(qk.searches.detail(id));
      patchSearchInCaches(client, id, { is_active: isActive });
      return { previous };
    },
    onError: (_error, { id, isActive }) => {
      patchSearchInCaches(client, id, { is_active: !isActive });
    },
    onSettled: () => void client.invalidateQueries({ queryKey: qk.searches.all }),
  });
}

export function useDeleteSearch() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => searchesApi.remove(id),
    onSuccess: (_data, id) => {
      removeSearchesFromCaches(client, [id]);
      void client.invalidateQueries({ queryKey: qk.searches.all });
      void client.invalidateQueries({ queryKey: qk.notifications.unseenCount });
    },
  });
}

export function useBulkSearches() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, action }: { ids: string[]; action: SearchBulkAction }) =>
      searchesApi.bulk(ids, action),
    onSuccess: (_data, { ids, action }) => {
      if (action === 'delete') removeSearchesFromCaches(client, ids);
      void client.invalidateQueries({ queryKey: qk.searches.all });
      void client.invalidateQueries({ queryKey: qk.results.all });
      void client.invalidateQueries({ queryKey: qk.notifications.unseenCount });
    },
  });
}

/** Triggers "Aggiorna ora". The returned search is already pending/running, so polling starts. */
export function useRunSearch() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => searchesApi.run(id),
    onSuccess: (search) => {
      client.setQueryData<Search>(qk.searches.detail(search.id), search);
      patchSearchInCaches(client, search.id, search);
    },
  });
}
