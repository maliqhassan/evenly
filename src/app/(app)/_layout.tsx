import { useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useEffect } from 'react';

import { api } from '@/api';
import { OfflineBanner } from '@/features/system/OfflineBanner';
import { listenForNotificationTaps, registerForPush } from '@/lib/push';
import { invalidateLedger, qk } from '@/queries';
import { usePendingInvite } from '@/stores/drafts';
import { colors } from '@/theme';

export const unstable_settings = { initialRouteName: '(tabs)' };

export default function AppLayout() {
  const qc = useQueryClient();
  const pendingInvite = usePendingInvite((s) => s.code);

  useEffect(() => {
    void registerForPush();
    return listenForNotificationTaps();
  }, []);

  // Realtime: refresh derived views when the server reports changes.
  useEffect(() => {
    if (!api.subscribe) return;
    return api.subscribe((topic) => {
      if (topic === 'notifications') qc.invalidateQueries({ queryKey: qk.notifications });
      if (topic === 'ledger') invalidateLedger(qc);
      if (topic === 'groups') {
        qc.invalidateQueries({ queryKey: qk.groups });
        qc.invalidateQueries({ queryKey: qk.friends });
      }
    });
  }, [qc]);

  // Resume an invite link opened before signing in.
  useEffect(() => {
    if (!pendingInvite) return;
    usePendingInvite.getState().set(null);
    router.push({ pathname: '/join/[code]', params: { code: pendingInvite } });
  }, [pendingInvite]);

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="new-group" options={{ presentation: 'modal' }} />
        <Stack.Screen name="add-expense" options={{ presentation: 'modal' }} />
        <Stack.Screen name="record-payment" options={{ presentation: 'modal' }} />
        <Stack.Screen name="join/[code]" options={{ presentation: 'modal' }} />
      </Stack>
      <OfflineBanner />
    </>
  );
}
