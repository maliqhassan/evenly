import { useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useEffect } from 'react';

import { api } from '@/api';
import { openPricing } from '@/features/plan';
import { OfflineBanner } from '@/features/system/OfflineBanner';
import { listenForNotificationTaps, registerForPush } from '@/lib/push';
import { secureStorage } from '@/lib/secure-storage';
import { invalidateLedger, qk, usePlan } from '@/queries';
import { usePendingInvite } from '@/stores/drafts';
import { colors } from '@/theme';

export const unstable_settings = { initialRouteName: '(tabs)' };

/** Set once Pro has been offered on this install (right after onboarding). */
const PRO_OFFERED_KEY = 'evenly.pro-offered.v1';

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

  // Offer Pro once per install, the first time a Free user reaches the app.
  const plan = usePlan().data?.plan;
  useEffect(() => {
    if (plan !== 'free') return;
    let cancelled = false;
    void secureStorage
      .getItem(PRO_OFFERED_KEY)
      .catch(() => null)
      .then((seen) => {
        if (cancelled || seen === '1') return;
        void secureStorage.setItem(PRO_OFFERED_KEY, '1').catch(() => undefined);
        openPricing('offer');
      });
    return () => {
      cancelled = true;
    };
  }, [plan]);

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
        <Stack.Screen name="pricing" options={{ presentation: 'modal' }} />
      </Stack>
      <OfflineBanner />
    </>
  );
}
