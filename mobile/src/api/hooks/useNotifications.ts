import { useQuery } from '@tanstack/react-query';

import { notificationsApi } from '../endpoints';
import { qk } from '../queryKeys';

const POLL_MS = 30_000;

/** Number of unseen results: drives the bell and the tab badge. Polled while the app is active. */
export function useUnseenCount() {
  return useQuery({
    queryKey: qk.notifications.unseenCount,
    queryFn: notificationsApi.unseenCount,
    refetchInterval: POLL_MS,
    select: (data) => data.count,
  });
}
