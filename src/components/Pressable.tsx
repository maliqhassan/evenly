import * as Haptics from 'expo-haptics';
import type { ComponentRef, Ref } from 'react';
import {
  Pressable as RNPressable,
  type PressableProps as RNPressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { motion } from '@/theme';

export interface PressableProps extends Omit<RNPressableProps, 'style' | 'ref'> {
  style?: StyleProp<ViewStyle>;
  /** Scale slightly on press (buttons, cards). */
  scaleOnPress?: boolean;
  haptic?: boolean;
  ref?: Ref<ComponentRef<typeof RNPressable>>;
}

/** Pressable with the design's press state (opacity 0.7 / scale 0.98). */
export function Pressable({
  style,
  scaleOnPress = true,
  haptic = false,
  onPress,
  disabled,
  ref,
  ...rest
}: PressableProps) {
  return (
    <RNPressable
      ref={ref}
      accessibilityRole={rest.accessibilityRole ?? 'button'}
      disabled={disabled}
      hitSlop={rest.hitSlop ?? 4}
      onPress={(e) => {
        if (haptic) Haptics.selectionAsync().catch(() => undefined);
        onPress?.(e);
      }}
      style={({ pressed }) => [
        style,
        pressed && !disabled
          ? { opacity: motion.pressedOpacity, transform: scaleOnPress ? [{ scale: motion.pressedScale }] : undefined }
          : null,
      ]}
      {...rest}
    />
  );
}
