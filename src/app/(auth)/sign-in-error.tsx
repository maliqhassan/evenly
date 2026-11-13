import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, GoogleButton, Icon, Pressable, Screen, Text } from '@/components';
import { t } from '@/i18n';
import { authClient } from '@/lib/auth';
import { config } from '@/lib/config';
import { retrySession } from '@/lib/session';
import { colors, radii } from '@/theme';

const COPY: Record<string, string> = {
  cancelled: 'Google sign-in was cancelled or the connection dropped. Nothing was saved.',
  network: 'We couldn’t reach the server. Check your connection — nothing was saved.',
  play_services: 'Google Play services is unavailable or out of date on this device.',
  config: 'Google sign-in isn’t set up for this build yet.',
  server: 'We signed you in with Google but couldn’t load your account. Nothing was saved.',
  unknown: 'Google sign-in was cancelled or the connection dropped. Nothing was saved.',
};

/** 05 — Sign-in didn't complete */
export default function SignInError() {
  const { reason = 'unknown', message } = useLocalSearchParams<{ reason?: string; message?: string }>();
  const [busy, setBusy] = useState(false);

  const tryAgain = async () => {
    setBusy(true);
    if (reason === 'server' || reason === 'network') {
      await retrySession();
      setBusy(false);
      return;
    }
    const r = await authClient.signInWithGoogle();
    setBusy(false);
    if (r.status !== 'success') router.setParams({ reason: r.status === 'cancelled' ? 'cancelled' : r.reason });
  };

  return (
    <Screen
      padding={24}
      footer={
        <View style={styles.footer}>
          <Button label={t('Try again')} onPress={tryAgain} loading={busy} />
          <GoogleButton onPress={tryAgain} label={t('Use another Google account')} loading={false} />
          <Pressable
            onPress={() => Linking.openURL(`mailto:${config.supportEmail}?subject=Sign-in%20help`)}
            accessibilityRole="link"
            scaleOnPress={false}
            style={{ marginTop: 4 }}
          >
            <Text variant="body" color={colors.textMuted}>
              {t('Need help?')} <Text variant="bodyStrong">{t('Contact support')}</Text>
            </Text>
          </Pressable>
        </View>
      }
    >
      <View style={styles.body}>
        <View style={styles.alert}>
          <Icon name="circle-alert" size={36} color={colors.negative} />
        </View>
        <View style={{ gap: 8 }}>
          <Text variant="h2" align="center" accessibilityRole="header">
            {t('Sign-in didn’t complete')}
          </Text>
          <Text variant="bodyLg" color={colors.textMuted} align="center">
            {COPY[reason] ?? COPY.unknown}
          </Text>
          {__DEV__ && message ? (
            <Text variant="caption" color={colors.textFaint} align="center">
              {message}
            </Text>
          ) : null}
        </View>
        <View style={styles.card}>
          <View style={[styles.tip, styles.tipDivider]}>
            <Icon name="wifi-off" size={18} color={colors.forest} />
            <Text variant="body" color={colors.forest}>
              {t('Check your internet connection')}
            </Text>
          </View>
          <View style={styles.tip}>
            <Icon name="user-round-check" size={18} color={colors.forest} />
            <Text variant="body" color={colors.forest}>
              {t('Use the same account as last time')}
            </Text>
          </View>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 22, paddingHorizontal: 4 },
  alert: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.negativeSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  tip: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  tipDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  footer: { gap: 12, alignItems: 'center' },
});
