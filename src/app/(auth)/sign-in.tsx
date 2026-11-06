import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { GoogleButton, Icon, Logo, Screen, Text } from '@/components';
import { authClient } from '@/lib/auth';
import { config, isDemo } from '@/lib/config';
import { useSession } from '@/stores/session';
import { colors, spacing } from '@/theme';

/**
 * 03 — Sign in. Google is the only provider (no passwords anywhere).
 * Cancel/failure routes to 05.
 */
export default function SignIn() {
  const [busy, setBusy] = useState(false);
  const authenticating = useSession((s) => s.authenticating);

  const onGoogle = async () => {
    setBusy(true);
    const result = await authClient.signInWithGoogle();
    setBusy(false);
    if (result.status === 'success') return; // session listener takes over
    router.push({
      pathname: '/sign-in-error',
      params: {
        reason: result.status === 'cancelled' ? 'cancelled' : result.reason,
        message: result.status === 'error' ? (result.message ?? '') : '',
      },
    });
  };

  return (
    <Screen
      padding={28}
      footer={
        <View style={styles.footer}>
          <GoogleButton onPress={onGoogle} loading={busy || authenticating} />
          <Text variant="caption" color={colors.textSubtle} align="center" style={{ marginTop: 6 }}>
            By continuing you agree to our{' '}
            <Text
              variant="captionMedium"
              onPress={() => WebBrowser.openBrowserAsync(config.termsUrl)}
              accessibilityRole="link"
            >
              Terms
            </Text>{' '}
            and{' '}
            <Text
              variant="captionMedium"
              onPress={() => WebBrowser.openBrowserAsync(config.privacyUrl)}
              accessibilityRole="link"
            >
              Privacy Policy
            </Text>
            .
          </Text>
        </View>
      }
    >
      <View style={styles.body}>
        <Logo size="md" />
        <View style={{ gap: 10 }}>
          <Text variant="headline" accessibilityRole="header">
            Sign in to{'\n'}
            <Text variant="headlineItalic">Evenly</Text>
          </Text>
          <Text variant="bodyLg" color={colors.textMuted}>
            One tap with the account you already use. No passwords to remember.
          </Text>
        </View>
        <View style={{ gap: 10 }}>
          <Reassurance icon="shield-check" text="Secured by Google" />
          <Reassurance icon="lock" text="We never see or store a password" />
          {isDemo ? <Reassurance icon="sparkles" text="Demo mode — sample data, nothing is saved" /> : null}
        </View>
      </View>
    </Screen>
  );
}

function Reassurance({ icon, text }: { icon: 'shield-check' | 'lock' | 'sparkles'; text: string }) {
  return (
    <View style={styles.reassure}>
      <View style={styles.reassureIcon}>
        <Icon name={icon} size={15} color={colors.positive} />
      </View>
      <Text variant="body" color={colors.forest}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: 'center', gap: 28 },
  footer: { gap: 12, alignItems: 'center', paddingHorizontal: spacing.screenAuth - 28 },
  reassure: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  reassureIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.positiveSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
