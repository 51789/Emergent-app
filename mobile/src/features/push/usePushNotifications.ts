import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { qk } from '@/api/queryKeys';

import { parsePushTarget } from './pushTarget';
import { getNotifications, registerPushToken } from './pushToken';

/** Identifier of the last tap we already navigated for (avoids re-navigating on remounts). */
let lastHandledResponseId: string | null = null;

/**
 * Wires push notifications for a signed-in user (mount it inside the authenticated layout):
 * - registers the Expo push token with the backend;
 * - refreshes counters when a push arrives while the app is open;
 * - when the user taps a push (warm or cold start) opens that search's results if the payload
 *   carries a `search_id`, otherwise the Notifications screen.
 */
export function usePushNotifications(): void {
  const router = useRouter();
  const client = useQueryClient();

  useEffect(() => {
    void registerPushToken();
  }, []);

  useEffect(() => {
    const Notifications = getNotifications();
    if (!Notifications) return;

    const openTarget = (responseId: string, data: unknown) => {
      if (lastHandledResponseId === responseId) return;
      lastHandledResponseId = responseId;
      const target = parsePushTarget(data);
      if (target.kind === 'search') {
        router.push({ pathname: '/search/[id]', params: { id: target.searchId } });
      } else {
        router.navigate('/notifications');
      }
    };

    const received = Notifications.addNotificationReceivedListener(() => {
      void client.invalidateQueries({ queryKey: qk.notifications.unseenCount });
      void client.invalidateQueries({ queryKey: qk.searches.all });
      void client.invalidateQueries({ queryKey: qk.results.all });
    });

    const tapped = Notifications.addNotificationResponseReceivedListener((response) => {
      openTarget(response.notification.request.identifier, response.notification.request.content.data);
    });

    // Cold start: the app was launched by tapping a notification.
    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) {
          openTarget(response.notification.request.identifier, response.notification.request.content.data);
        }
      })
      .catch(() => undefined);

    return () => {
      received.remove();
      tapped.remove();
    };
  }, [client, router]);
}
