import { StyleSheet, View } from 'react-native';

import { colors, radii } from '@/theme';

import { Pressable } from './Pressable';
import { Text } from './Text';

export interface SegmentedProps<T extends string> {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

/** Segmented control: #E8EBE7 track, white selected segment. */
export function Segmented<T extends string>({ options, value, onChange }: SegmentedProps<T>) {
  return (
    <View style={styles.track} accessibilityRole="tablist">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            haptic
            scaleOnPress={false}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={o.label}
            style={[styles.segment, selected && styles.selected]}
          >
            <Text variant={selected ? 'bodyStrong' : 'body'} color={selected ? colors.ink : colors.textMuted}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Underlined tabs (Group details: Expenses / Members / Totals). */
export function UnderlineTabs<T extends string>({ options, value, onChange }: SegmentedProps<T>) {
  return (
    <View style={styles.underlineRow} accessibilityRole="tablist">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            scaleOnPress={false}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={[styles.underlineTab, selected && styles.underlineSelected]}
          >
            <Text variant={selected ? 'bodyStrong' : 'body'} color={selected ? colors.ink : colors.textFaint}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: radii.xl, backgroundColor: colors.surfaceMuted2 },
  segment: { flex: 1, height: 36, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  selected: { backgroundColor: colors.surface },
  underlineRow: { flexDirection: 'row', gap: 22, borderBottomWidth: 1, borderBottomColor: colors.dividerStrong },
  underlineTab: {
    paddingBottom: 10,
    paddingTop: 6,
    marginBottom: -1,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  underlineSelected: { borderBottomColor: colors.ink },
});
