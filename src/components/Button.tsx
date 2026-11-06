import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radii, sizes, spacing } from '@/theme';

import { Icon, type IconName } from './Icon';
import { Pressable } from './Pressable';
import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'outline' | 'muted' | 'destructive' | 'ink' | 'mint' | 'ghostOnDark';
type Size = 'lg' | 'md' | 'sm';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}

const VARIANTS: Record<Variant, { bg: string; fg: string; border?: string }> = {
  primary: { bg: colors.forest, fg: colors.onDarkStrong },
  secondary: { bg: colors.surface, fg: colors.ink },
  outline: { bg: colors.surface, fg: colors.ink, border: colors.borderStrong },
  muted: { bg: colors.surfaceMuted, fg: colors.ink },
  destructive: { bg: colors.surface, fg: colors.negative },
  ink: { bg: colors.ink, fg: colors.onDarkStrong },
  mint: { bg: colors.mint, fg: colors.forest },
  ghostOnDark: { bg: 'transparent', fg: colors.onDark, border: colors.onDarkBorder },
};

const SIZES: Record<
  Size,
  { height: number; px: number; text: 'bodyLgMedium' | 'bodyMedium' | 'captionStrong'; icon: number }
> = {
  lg: { height: sizes.button, px: 24, text: 'bodyLgMedium', icon: 20 },
  md: { height: sizes.buttonMd, px: 16, text: 'bodyMedium', icon: 18 },
  sm: { height: sizes.buttonSm, px: 14, text: 'captionStrong', icon: 16 },
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  icon,
  disabled,
  loading,
  fullWidth = size === 'lg',
  style,
  accessibilityHint,
}: ButtonProps) {
  const v = VARIANTS[variant];
  const s = SIZES[size];
  const isDisabled = disabled || loading;
  const bg = disabled && (variant === 'primary' || variant === 'ink') ? colors.disabled : v.bg;
  const fg = disabled && (variant === 'primary' || variant === 'ink') ? colors.onDarkStrong : v.fg;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      haptic
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      style={[
        styles.base,
        {
          height: s.height,
          minHeight: Math.max(s.height, size === 'sm' ? 34 : sizes.hitTarget),
          paddingHorizontal: s.px,
          borderRadius: size === 'lg' ? radii.button : s.height / 2,
          backgroundColor: bg,
          borderWidth: v.border ? 1 : 0,
          borderColor: v.border,
          alignSelf: fullWidth ? 'stretch' : 'auto',
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.row}>
          {icon ? <Icon name={icon} size={s.icon} color={fg} /> : null}
          <Text variant={s.text} color={fg} numberOfLines={1}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
