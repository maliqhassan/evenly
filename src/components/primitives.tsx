/**
 * Small building blocks: IconTile, Card, Divider, Pill, Chip, Checkbox,
 * ProgressBar, SectionHeader, InfoNote, Row.
 */
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radii, spacing } from '@/theme';

import { Icon, type IconName } from './Icon';
import { Pressable } from './Pressable';
import { Text } from './Text';

/* ----------------------------- IconTile ----------------------------- */
interface IconTileProps {
  icon: IconName | string;
  size?: number;
  iconSize?: number;
  radius?: number;
  bg?: string;
  fg?: string;
  round?: boolean;
  style?: StyleProp<ViewStyle>;
}
export function IconTile({
  icon,
  size = 38,
  iconSize,
  radius = 12,
  bg = colors.surfaceMuted,
  fg = colors.forest,
  round,
  style,
}: IconTileProps) {
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: round ? size / 2 : radius,
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <Icon name={icon} size={iconSize ?? Math.round(size * 0.46)} color={fg} />
    </View>
  );
}

/* ------------------------------- Card ------------------------------- */
interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  tone?: 'surface' | 'bg' | 'dark' | 'positive' | 'negative';
  radius?: number;
  onPress?: () => void;
  accessibilityLabel?: string;
}
const CARD_BG = {
  surface: colors.surface,
  bg: colors.bg,
  dark: colors.forestCard,
  positive: colors.positiveSoft,
  negative: colors.negativeSoft,
};
export function Card({
  children,
  style,
  padded = false,
  tone = 'surface',
  radius = radii.cardLg,
  onPress,
  accessibilityLabel,
}: CardProps) {
  const s = [{ backgroundColor: CARD_BG[tone], borderRadius: radius }, padded && { padding: spacing['3xl'] }, style];
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={s} accessibilityLabel={accessibilityLabel}>
        {children}
      </Pressable>
    );
  }
  return <View style={s}>{children}</View>;
}

/* ------------------------------ Divider ----------------------------- */
export function Divider({ inset = 0, color = colors.divider }: { inset?: number; color?: string }) {
  return <View style={{ height: 1, backgroundColor: color, marginLeft: inset }} />;
}

/* -------------------------------- Pill ------------------------------ */
type PillTone = 'positive' | 'negative' | 'warning' | 'neutral';
const PILL: Record<PillTone, [string, string]> = {
  positive: [colors.positiveSoft, colors.positive],
  negative: [colors.negativeSoft, colors.negative],
  warning: [colors.warningSoft, colors.warning],
  neutral: [colors.surfaceMuted, colors.textSubtle],
};
export function Pill({
  label,
  tone = 'neutral',
  variant = 'badge',
}: {
  label: string;
  tone?: PillTone;
  variant?: 'badge' | 'soft';
}) {
  const [bg, fg] = PILL[tone];
  if (variant === 'soft') {
    return (
      <View style={[styles.softPill, { backgroundColor: bg }]}>
        <Text variant="captionMedium" color={fg}>
          {label}
        </Text>
      </View>
    );
  }
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text variant="pill" color={fg}>
        {label}
      </Text>
    </View>
  );
}

/* -------------------------------- Chip ------------------------------ */
interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /** Background for unselected chips (white on bg screens, bg on white screens). */
  idleBg?: string;
  icon?: IconName;
}
export function Chip({ label, selected, onPress, idleBg = colors.surface, icon }: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      haptic
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={label}
      style={[styles.chip, { backgroundColor: selected ? colors.forest : idleBg }]}
    >
      {icon ? <Icon name={icon} size={14} color={selected ? colors.onDarkStrong : colors.ink} /> : null}
      <Text variant="secondary" color={selected ? colors.onDarkStrong : colors.ink}>
        {label}
      </Text>
    </Pressable>
  );
}

/* ------------------------------ Checkbox ---------------------------- */
export function Checkbox({ checked, onPress, label }: { checked: boolean; onPress?: () => void; label: string }) {
  return (
    <Pressable
      onPress={onPress}
      haptic
      hitSlop={12}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      style={[styles.checkbox, checked ? styles.checkboxOn : styles.checkboxOff]}
    >
      {checked ? <Icon name="check" size={14} color={colors.onDarkStrong} strokeWidth={2.5} /> : null}
    </Pressable>
  );
}

/* ---------------------------- ProgressBar --------------------------- */
export function ProgressBar({
  value,
  color,
  track,
  height = 6,
}: {
  value: number;
  color: string;
  track: string;
  height?: number;
}) {
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View
      style={{ height, borderRadius: height / 2, backgroundColor: track, overflow: 'hidden' }}
      accessibilityRole="progressbar"
      accessibilityValue={{ now: Math.round(pct * 100), min: 0, max: 100 }}
    >
      <View style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: color, borderRadius: height / 2 }} />
    </View>
  );
}

/* --------------------------- SectionHeader -------------------------- */
export function SectionHeader({
  title,
  action,
  onAction,
  right,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  right?: React.ReactNode;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text variant="section" accessibilityRole="header">
        {title}
      </Text>
      {right}
      {action ? (
        <Pressable onPress={onAction} accessibilityRole="link" hitSlop={12} scaleOnPress={false}>
          <Text variant="secondary" color={colors.positive}>
            {action}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Overline({ children, style }: { children: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={style}>
      <Text variant="overline" color={colors.textFaint}>
        {children}
      </Text>
    </View>
  );
}

/* ------------------------------ InfoNote ---------------------------- */
export function InfoNote({
  children,
  tone = 'positive',
  icon = 'info',
}: {
  children: string;
  tone?: 'positive' | 'plain';
  icon?: IconName;
}) {
  if (tone === 'plain') {
    return (
      <View style={styles.plainNote}>
        <Icon name={icon} size={16} color={colors.textSubtle} />
        <Text variant="caption" color={colors.textSubtle} style={{ flex: 1, lineHeight: 17 }}>
          {children}
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.note}>
      <Icon name={icon} size={18} color={colors.positive} />
      <Text variant="secondary" color={colors.forest} style={{ flex: 1 }}>
        {children}
      </Text>
    </View>
  );
}

/* -------------------------------- Row ------------------------------- */
export function Row({
  children,
  gap = spacing.xl,
  style,
  align = 'center',
}: {
  children: React.ReactNode;
  gap?: number;
  style?: StyleProp<ViewStyle>;
  align?: 'center' | 'flex-start' | 'flex-end';
}) {
  return <View style={[{ flexDirection: 'row', alignItems: align, gap }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  pill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radii.xs, alignSelf: 'flex-start' },
  softPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.md },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    minHeight: 36,
  },
  checkbox: { width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: colors.forest },
  checkboxOff: { borderWidth: 1.5, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  note: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    padding: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: colors.positiveSoft,
  },
  plainNote: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
});
