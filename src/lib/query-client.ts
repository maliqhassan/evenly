import { focusManager, onlineManager, QueryClient } from '@tanstack/react-query';
import { AppState, Platform } from 'react-native';

import { toAppError } from '@/api/errors';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 30 * 60_000,
      retry: (count, error) => {
        const code = toAppError(error).code;
        if (code === 'forbidden' || code === 'not_found' || code === 'not_member' || code === 'not_authenticated')
          return false;
        return count < 2;
      },
    },
    mutations: {
      // Financial mutations are idempotent server-side (client UUIDs), so a
      // single automatic retry on network failure is safe.
      retry: (count, error) => count < 1 && toAppError(error).code === 'network',
    },
  },
});

// Refetch when the app returns to the foreground.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => focusManager.setFocused(state === 'active'));
}

export { onlineManager };
