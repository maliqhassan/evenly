// Import only the weights we use, so the other 13 font files stay out of the bundle.
import { DMSans_300Light } from '@expo-google-fonts/dm-sans/300Light';
import { DMSans_300Light_Italic } from '@expo-google-fonts/dm-sans/300Light_Italic';
import { DMSans_400Regular } from '@expo-google-fonts/dm-sans/400Regular';
import { DMSans_500Medium } from '@expo-google-fonts/dm-sans/500Medium';
import { DMSans_600SemiBold } from '@expo-google-fonts/dm-sans/600SemiBold';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import * as Linking from 'expo-linking';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastHost } from '@/components';
import { ConfigMissingScreen } from '@/features/system/ConfigMissingScreen';
import { SplashView } from '@/features/system/SplashView';
import { configErrors, parseInviteCode } from '@/lib/config';
import { initMonitoring, wrapRoot } from '@/lib/monitoring';
import { queryClient } from '@/lib/query-client';
import { startSessionListener } from '@/lib/session';
import { usePendingInvite } from '@/stores/drafts';
import { useSession } from '@/stores/session';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => undefined);
initMonitoring();

function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    DMSans_300Light,
    DMSans_300Light_Italic,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
  });
  const status = useSession((s) => s.status);
  const url = Linking.useLinkingURL();

  useEffect(() => {
    if (configErrors.length) return;
    return startSessionListener();
  }, []);

  // Capture invite deep links (evenly://join/<code>, https://evenly.app/j/<code>)
  // so they survive the sign-in flow.
  useEffect(() => {
    if (!url || !/\/(j|join)\//.test(url)) return;
    const code = parseInviteCode(url);
    if (code) usePendingInvite.getState().set(code);
  }, [url]);

  const ready = fontsLoaded || !!fontError;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  if (!ready) return null;
  if (configErrors.length) return <ConfigMissingScreen missing={configErrors} />;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        {status === 'booting' ? (
          <SplashView />
        ) : (
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.bg },
              animation: 'slide_from_right',
            }}
          >
            <Stack.Protected guard={status === 'signedIn'}>
              <Stack.Screen name="(app)" />
            </Stack.Protected>
            <Stack.Protected guard={status === 'onboarding'}>
              <Stack.Screen name="(onboarding)" />
            </Stack.Protected>
            <Stack.Protected guard={status === 'signedOut'}>
              <Stack.Screen name="(auth)" />
            </Stack.Protected>
          </Stack>
        )}
        <ToastHost />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

export default wrapRoot(RootLayout);
