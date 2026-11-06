import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Logo, Text } from '@/components';
import { colors } from '@/theme';

/** 01 — Splash: full forest, centred light logo tile + wordmark, footer tagline. */
export function SplashView() {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root} accessibilityLabel="Evenly is loading">
      <StatusBar style="light" />
      <View style={styles.center}>
        <Logo size="lg" tone="light" />
        <Text variant="headline" color={colors.onDark}>
          Evenly
        </Text>
      </View>
      <Text variant="body" color={colors.onDarkMuted} align="center" style={{ paddingBottom: insets.bottom + 64 }}>
        Shared money, made simple.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.forest },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18 },
});
