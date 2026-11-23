export type PushTarget = { kind: 'search'; searchId: string } | { kind: 'notifications' };

/**
 * Where a tapped push notification leads. The backend sends
 * `data = { type: "new_results", search_id, category, count }` for scheduled background runs:
 * with a `search_id` we open that search's results, otherwise the Notifications screen.
 */
export function parsePushTarget(data: unknown): PushTarget {
  const searchId = (data as { search_id?: unknown } | null | undefined)?.search_id;
  if (typeof searchId === 'string' && searchId.trim().length > 0) {
    return { kind: 'search', searchId: searchId.trim() };
  }
  return { kind: 'notifications' };
}
