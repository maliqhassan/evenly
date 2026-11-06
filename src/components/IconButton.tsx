import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, sizes } from '@/theme';

import { Icon, type IconName } from './Icon';
import { Pressable } from './Pressable';

type Tone = 'white' | 'muted' | 'onDark' | 'plain';

const TONES: Record<Tone, { bg: string; fg: string }> = {
  white: { bg: colors.surface, fg: colors.ink },
  muted: { bg: colors.bg, fg: colors.ink },
  onDark: { bg: colors.onDarkTranslucent, fg: colors.onDark },
  plain: { bg: 'transparent', fg: colors.ink },
};

export interface IconButtonProps {
  icon: IconName;
  onPress?: () => void;
  /** Required: icon-only buttons need a spoken label. */
  label: string;
  tone?: Tone;
  color?: string;
  iconSize?: number;
  badge?: boolean;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}

/** 44×44 circular icon button (white on bg screens, #F4F5F3 on white screens). */
export function IconButton({
  icon,
  onPress,
  label,
  tone = 'white',
  color,
  iconSize = 20,
  badge,
  style,
  disabled,
}: IconButtonProps) {
  const t = TONES[tone];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      style={[styles.base, { backgroundColor: t.bg, opacity: disabled ? 0.4 : 1 }, style]}
    >
      <Icon name={icon} size={iconSize} color={color ?? t.fg} />
      {badge ? <View style={styles.badge} accessibilityLabel="unread" /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: sizes.iconButton,
    height: sizes.iconButton,
    borderRadius: sizes.iconButton / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 10,
    right: 11,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.negative,
    borderWidth: 2,
    borderColor: colors.surface,
  },
});
