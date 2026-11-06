import { StyleSheet, View } from 'react-native';

import { colors } from '@/theme';

import { Text } from './Text';

const SIZES = {
  // tile, radius, ring diameter, ring stroke
  xs: [34, 10, 12, 4],
  sm: [40, 12, 16, 4],
  md: [64, 18, 22, 7],
  lg: [76, 22, 30, 8],
} as const;

interface LogoProps {
  size?: keyof typeof SIZES;
  /** "dark" = forest tile with light ring (default); "light" = light tile with forest ring (splash). */
  tone?: 'dark' | 'light';
}

/** Rounded square with a ring cut-out — the Evenly mark, as a vector. */
export function Logo({ size = 'md', tone = 'dark' }: LogoProps) {
  const [tile, radius, ring, stroke] = SIZES[size];
  const bg = tone === 'dark' ? colors.forest : colors.onDark;
  const fg = tone === 'dark' ? colors.onDark : colors.forest;
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel="Evenly"
      style={[styles.tile, { width: tile, height: tile, borderRadius: radius, backgroundColor: bg }]}
    >
      <View style={{ width: ring, height: ring, borderRadius: ring / 2, borderWidth: stroke, borderColor: fg }} />
    </View>
  );
}

export function Wordmark({ size = 'xs' }: { size?: 'xs' | 'sm' }) {
  return (
    <View style={styles.wordmark}>
      <Logo size={size} />
      <Text variant="h3" style={{ letterSpacing: -0.48 }}>
        Evenly
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: 'center', justifyContent: 'center' },
  wordmark: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
});
