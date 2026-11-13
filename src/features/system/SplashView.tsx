import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { Text } from '@/components';
import { t } from '@/i18n';
import { colors } from '@/theme';

// The mark's ring (app icon geometry: stroke ≈ 22% of the ring's outer size).
const SIZE = 112;
const STROKE = 24;
const R = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * R;

const DRAW_MS = 900;
const TEXT_MS = 320;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface SplashViewProps {
  /** Called once the intro animation has played (immediately with reduced motion). */
  onFinish?: () => void;
}

/**
 * 01 — Splash. Forest background (continuing the native launch screen), the
 * ring draws itself clockwise from 12 o'clock — starting as a single dot —
 * into the full Evenly mark, then the wordmark and tagline fade in.
 */
export function SplashView({ onFinish }: SplashViewProps) {
  const insets = useSafeAreaInsets();
  const [draw] = useState(() => new Animated.Value(0));
  const [text] = useState(() => new Animated.Value(0));

  useEffect(() => {
    let cancelled = false;
    const finish = () => !cancelled && onFinish?.();
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (cancelled) return;
        if (reduce) {
          draw.setValue(1);
          text.setValue(1);
          finish();
          return;
        }
        Animated.sequence([
          Animated.timing(draw, {
            toValue: 1,
            duration: DRAW_MS,
            easing: Easing.inOut(Easing.cubic),
            useNativeDriver: false, // animates an SVG prop
          }),
          Animated.timing(text, {
            toValue: 1,
            duration: TEXT_MS,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]).start(finish);
      });
    return () => {
      cancelled = true;
    };
    // Plays once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dashOffset = draw.interpolate({ inputRange: [0, 1], outputRange: [CIRCUMFERENCE, 0] });
  const rise = text.interpolate({ inputRange: [0, 1], outputRange: [8, 0] });

  return (
    <View style={styles.root} accessibilityLabel="Evenly is loading">
      <StatusBar style="light" />
      <View style={styles.center}>
        <Svg width={SIZE} height={SIZE} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <AnimatedCircle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke={colors.onDark}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
            strokeDashoffset={dashOffset}
            // Start at 12 o'clock and draw clockwise.
            rotation={-90}
            origin={`${SIZE / 2}, ${SIZE / 2}`}
          />
        </Svg>
        <Animated.View style={{ opacity: text, transform: [{ translateY: rise }] }}>
          <Text variant="headline" color={colors.onDark}>
            Evenly
          </Text>
        </Animated.View>
      </View>
      <Animated.View style={{ opacity: text, paddingBottom: insets.bottom + 64 }}>
        <Text variant="body" color={colors.onDarkMuted} align="center">
          {t('Shared money, made simple.')}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.forest },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 22 },
});
