import type { InfiniteData, QueryClient, QueryKey } from '@tanstack/react-query';

import { qk } from './queryKeys';
import type { Paginated, Result, ResultListParams, Search } from './types';

export type InfinitePage<T> = InfiniteData<Paginated<T>, string | undefined>;

/** Flattens every loaded page of an infinite query into a single list. */
export function flattenPages<T>(data: InfiniteData<Paginated<T>, unknown> | undefined): T[] {
  return data ? data.pages.flatMap((page) => page.items) : [];
}

function mapCaches<T>(
  client: QueryClient,
  root: QueryKey,
  mapper: (items: T[], key: QueryKey) => T[],
): void {
  for (const [key, data] of client.getQueriesData<InfinitePage<T>>({ queryKey: root })) {
    if (!data?.pages) continue;
    client.setQueryData<InfinitePage<T>>(key, {
      ...data,
      pages: data.pages.map((page) => ({ ...page, items: mapper(page.items, key) })),
    });
  }
}

/** Applies `patch` to a result in every cached results list. */
export function patchResultInCaches(client: QueryClient, id: string, patch: Partial<Result>): void {
  mapCaches<Result>(client, qk.results.all, (items, key) => {
    const params = (key[2] ?? {}) as ResultListParams;
    return items.flatMap((item) => {
      if (item.id !== id) return [item];
      const next = { ...item, ...patch };
      // Items that no longer match a filtered list disappear immediately.
      if (key[1] === 'list') {
        if (params.favorite === true && next.is_favorite === false) return [];
        if (params.unseen === true && next.seen === true) return [];
      }
      return [next];
    });
  });
}

export function removeResultsFromCaches(client: QueryClient, ids: string[]): void {
  const removed = new Set(ids);
  mapCaches<Result>(client, qk.results.all, (items) => items.filter((item) => !removed.has(item.id)));
}

/** Applies `patch` to a search in every cached list and in its detail query. */
export function patchSearchInCaches(client: QueryClient, id: string, patch: Partial<Search>): void {
  mapCaches<Search>(client, qk.searches.all, (items) =>
    items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
  );
  client.setQueryData<Search>(qk.searches.detail(id), (old) => (old ? { ...old, ...patch } : old));
}

export function removeSearchesFromCaches(client: QueryClient, ids: string[]): void {
  const removed = new Set(ids);
  mapCaches<Search>(client, qk.searches.all, (items) => items.filter((item) => !removed.has(item.id)));
  ids.forEach((id) => client.removeQueries({ queryKey: qk.searches.detail(id) }));
}
