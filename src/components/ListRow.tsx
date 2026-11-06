import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, spacing } from '@/theme';

import { Icon } from './Icon';
import { Pressable } from './Pressable';
import { Text } from './Text';

export interface ListRowProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Label above the title (e.g. preferences rows: "Default currency" / "USD — US Dollar"). */
  label?: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
  value?: string;
  chevron?: boolean;
  onPress?: () => void;
  divider?: boolean;
  paddingH?: number;
  paddingV?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  titleColor?: string;
}

/** Generic list row used across grouped cards. */
export function ListRow({
  title,
  subtitle,
  label,
  left,
  right,
  value,
  chevron,
  onPress,
  divider = true,
  paddingH = spacing['2xl'],
  paddingV = spacing.xl,
  style,
  accessibilityLabel,
  titleColor,
}: ListRowProps) {
  const body = (
    <View
      style={[styles.row, { paddingHorizontal: paddingH, paddingVertical: paddingV }, divider && styles.divider, style]}
    >
      {left}
      <View style={styles.text}>
        {label ? (
          <Text variant="secondary" color={colors.textMuted}>
            {label}
          </Text>
        ) : null}
        {typeof title === 'string' ? (
          <Text variant={label ? 'bodyLgMedium' : 'bodyMedium'} color={titleColor} numberOfLines={1}>
            {title}
          </Text>
        ) : (
          title
        )}
        {typeof subtitle === 'string' ? (
          <Text variant="caption" color={colors.textSubtle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : (
          subtitle
        )}
      </View>
      {value ? (
        <Text variant="secondary" color={colors.textFaint}>
          {value}
        </Text>
      ) : null}
      {right}
      {chevron ? <Icon name="chevron-right" size={18} color={label ? colors.textFaint : colors.chevron} /> : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable
      onPress={onPress}
      scaleOnPress={false}
      accessibilityLabel={accessibilityLabel ?? (typeof title === 'string' ? title : undefined)}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xl, minHeight: 44 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  text: { flex: 1, gap: 2, minWidth: 0 },
});
