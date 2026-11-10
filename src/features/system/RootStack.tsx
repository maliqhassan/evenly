import { type Href, Stack } from 'expo-router';

import type { SessionStatus } from '@/stores/session';
import { colors } from '@/theme';

type GuardedStatus = Exclude<SessionStatus, 'booting'>;

/**
 * Where each session state lives. Guarded routes redirect here explicitly:
 * the navigator's default fallback targets a route group (e.g. `/(auth)`),
 * and our groups have no index route, so it ends on +not-found.
 */
export const sessionHome: Record<GuardedStatus, Href> = {
  signedIn: '/',
  onboarding: '/complete-profile',
  signedOut: '/welcome',
};

/** The root navigator: one route group per session state, guarded by the session status. */
export function RootStack({ status }: { status: GuardedStatus }) {
  const home = sessionHome[status];
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Protected guard={status === 'signedIn'} redirectTo={home}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={status === 'onboarding'} redirectTo={home}>
        <Stack.Screen name="(onboarding)" />
      </Stack.Protected>
      <Stack.Protected guard={status === 'signedOut'} redirectTo={home}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}
