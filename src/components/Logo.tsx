import { StyleSheet, View } from 'react-native';

import { colors } from '@/theme';

import { Text } from './Text';

/** Tile edge length per size. */
const SIZES = { xs: 34, sm: 40, md: 64, lg: 76 } as const;

// Official mark geometry (evenly-mark-light.svg, 64 × 64): corner radius 18,
// ring spanning half the tile, stroke 7. Everything scales from the tile size.
const CORNER = 18 / 64;
const RING = 1 / 2;
const STROKE = 7 / 64;

interface LogoProps {
  size?: keyof typeof SIZES;
  /** "dark" = forest tile with light ring (default); "light" = light tile with forest ring (splash). */
  tone?: 'dark' | 'light';
}

/** Rounded square with a ring cut-out — the Evenly mark, as a vector. */
export function Logo({ size = 'md', tone = 'dark' }: LogoProps) {
  const tile = SIZES[size];
  const radius = tile * CORNER;
  const ring = tile * RING;
  const stroke = tile * STROKE;
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
