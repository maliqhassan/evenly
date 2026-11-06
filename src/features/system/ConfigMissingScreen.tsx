import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Logo, Text } from '@/components';
import { colors, radii, spacing } from '@/theme';

/** Shown when live-mode environment variables are missing. */
export function ConfigMissingScreen({ missing }: { missing: string[] }) {
  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <Logo size="md" />
        <Text variant="h2">Configuration needed</Text>
        <Text variant="bodyLg" color={colors.textMuted}>
          Evenly can’t reach its backend because these environment variables are missing. Copy{' '}
          <Text variant="bodyLgStrong">.env.example</Text> to <Text variant="bodyLgStrong">.env</Text>, fill them in,
          and restart Metro — or set <Text variant="bodyLgStrong">EXPO_PUBLIC_DEMO_MODE=true</Text> to explore with
          sample data.
        </Text>
        <View style={styles.card}>
          {missing.map((m) => (
            <Text key={m} variant="secondaryMedium" style={styles.mono}>
              {m}
            </Text>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.screenAuth, gap: spacing['5xl'] },
  card: { backgroundColor: colors.surface, borderRadius: radii.card, padding: spacing['3xl'], gap: spacing.md },
  mono: { fontFamily: undefined },
});
