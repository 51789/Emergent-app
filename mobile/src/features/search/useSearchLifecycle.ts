import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { useMarkAllSeen } from '@/api/hooks';
import { qk } from '@/api/queryKeys';
import type { Search } from '@/api/types';
import { isSearchBusy } from '@/utils/searchStatus';

/**
 * Side effects of viewing one search:
 * - when a run finishes (pending/running -> done) the results and counters are refetched;
 * - once the results are on screen they are marked as seen server-side, which clears the
 *   bell / tab / tile badges. The cards keep their "NEW" marker until the next refetch.
 */
export function useSearchLifecycle(search: Search | undefined, resultsLoaded: boolean): void {
  const client = useQueryClient();
  const markAllSeen = useMarkAllSeen();
  const searchId = search?.id;
  const busy = isSearchBusy(search);

  const wasBusy = useRef(false);
  const needsMarkSeen = useRef(true);

  useEffect(() => {
    if (wasBusy.current && !busy && searchId) {
      void client.invalidateQueries({ queryKey: qk.results.bySearch(searchId) });
      void client.invalidateQueries({ queryKey: qk.searches.counts });
      void client.invalidateQueries({ queryKey: qk.notifications.unseenCount });
      needsMarkSeen.current = true;
    }
    wasBusy.current = busy;
  }, [busy, searchId, client]);

  const unseen = search?.unseen_count ?? 0;
  const { mutate } = markAllSeen;
  useEffect(() => {
    if (!searchId || !resultsLoaded || unseen === 0 || !needsMarkSeen.current) return;
    needsMarkSeen.current = false;
    mutate(searchId);
  }, [searchId, resultsLoaded, unseen, mutate]);
}
