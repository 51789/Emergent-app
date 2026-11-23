import { focusManager } from '@tanstack/react-query';
import { AppState, Platform } from 'react-native';

/**
 * React Query refetches "on window focus". On native there is no window: map it to the app
 * coming back to the foreground (on web the default visibilitychange listener is kept).
 */
if (Platform.OS !== 'web') {
  focusManager.setEventListener((handleFocus) => {
    const subscription = AppState.addEventListener('change', (state) => handleFocus(state === 'active'));
    return () => subscription.remove();
  });
}
