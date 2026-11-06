import { useEffect, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { colors, radii, shadows, spacing } from '@/theme';

import { Icon } from './Icon';
import { Text } from './Text';

type ToastTone = 'success' | 'error' | 'info';
interface ToastState {
  message: string | null;
  tone: ToastTone;
  key: number;
  show: (message: string, tone?: ToastTone) => void;
  hide: () => void;
}

export const useToast = create<ToastState>((set) => ({
  message: null,
  tone: 'success',
  key: 0,
  show: (message, tone = 'success') => set((s) => ({ message, tone, key: s.key + 1 })),
  hide: () => set({ message: null }),
}));

export const toast = {
  success: (m: string) => useToast.getState().show(m, 'success'),
  error: (m: string) => useToast.getState().show(m, 'error'),
  info: (m: string) => useToast.getState().show(m, 'info'),
};

/** Global toast host — mount once at the root. */
export function ToastHost() {
  const { message, tone, key, hide } = useToast();
  const insets = useSafeAreaInsets();
  const [y] = useState(() => new Animated.Value(-120));

  useEffect(() => {
    if (!message) return;
    Animated.spring(y, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();
    const t = setTimeout(() => {
      Animated.timing(y, { toValue: -120, duration: 200, useNativeDriver: true }).start(() => hide());
    }, 2600);
    return () => clearTimeout(t);
  }, [key, message, hide, y]);

  if (!message) return null;
  const icon = tone === 'error' ? 'circle-alert' : tone === 'info' ? 'info' : 'circle-check';
  const fg = tone === 'error' ? colors.negative : colors.positive;
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={[styles.toast, shadows.float, { top: insets.top + spacing.md, transform: [{ translateY: y }] }]}
    >
      <Icon name={icon} size={18} color={fg} />
      <Text variant="bodyMedium" style={{ flex: 1 }}>
        {message}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: spacing.screen,
    right: spacing.screen,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
  },
});
