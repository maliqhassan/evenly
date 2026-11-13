import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';

import { t } from '@/i18n';
import { colors, radii, spacing } from '@/theme';

import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

/** Empty state: one line + a primary action (per design guidance). */
export function EmptyState({
  icon = 'receipt',
  title,
  body,
  action,
  onAction,
}: {
  icon?: IconName;
  title: string;
  body?: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Icon name={icon} size={22} color={colors.positive} />
      </View>
      <Text variant="bodyLgStrong" align="center">
        {title}
      </Text>
      {body ? (
        <Text variant="secondary" color={colors.textMuted} align="center">
          {body}
        </Text>
      ) : null}
      {action ? (
        <Button label={action} onPress={onAction} size="md" fullWidth={false} style={{ marginTop: spacing.sm }} />
      ) : null}
    </View>
  );
}

export function ErrorState({ message = 'Something went wrong.', onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.negativeSoft }]}>
        <Icon name="circle-alert" size={22} color={colors.negative} />
      </View>
      <Text variant="bodyLgStrong" align="center">
        {message}
      </Text>
      {onRetry ? (
        <Button label={t('Try again')} onPress={onRetry} size="md" variant="secondary" fullWidth={false} />
      ) : null}
    </View>
  );
}

/** Shimmering placeholder block. */
export function Skeleton({
  width = '100%',
  height = 14,
  radius = 7,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const [pulse] = useState(() => new Animated.Value(0.5));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <Animated.View
      style={[{ width, height, borderRadius: radius, backgroundColor: colors.surfaceMuted2, opacity: pulse }, style]}
    />
  );
}

/** Skeleton rows matching list-row shapes. */
export function SkeletonRows({ count = 4, bg = colors.surface }: { count?: number; bg?: string }) {
  return (
    <View
      style={{ backgroundColor: bg, borderRadius: radii.card }}
      accessibilityLabel="Loading"
      accessibilityRole="progressbar"
    >
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={styles.skRow}>
          <Skeleton width={38} height={38} radius={12} />
          <View style={{ flex: 1, gap: 6 }}>
            <Skeleton width="60%" />
            <Skeleton width="35%" height={11} />
          </View>
          <Skeleton width={56} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing['9xl'], paddingHorizontal: spacing['7xl'] },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.positiveSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  skRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
});
