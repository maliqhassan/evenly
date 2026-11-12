import { type Href, Stack } from 'expo-router';

import type { SessionStatus } from '@/stores/session';
import { colors } from '@/theme';

type GuardedStatus = Exclude<SessionStatus, 'booting'>;

/**
 * Where each session state lives. Guarded routes redirect here explicitly:
 * the navigator's default fallback targets a route group (e.g. `/(auth)`),
 * and our groups have no index route, so it ends on +not-found.
 */
export function sessionHome(status: GuardedStatus, introSeen: boolean): Href {
  if (status === 'signedIn') return '/';
  if (status === 'onboarding') return '/complete-profile';
  // A new install sees the feature tour once before Welcome.
  return introSeen ? '/welcome' : '/intro';
}

/** The root navigator: one route group per session state, guarded by the session status. */
export function RootStack({ status, introSeen = true }: { status: GuardedStatus; introSeen?: boolean }) {
  const home = sessionHome(status, introSeen);
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
        <Stack.Screen name="intro" options={{ animation: 'fade' }} />
      </Stack.Protected>
    </Stack>
  );
}
