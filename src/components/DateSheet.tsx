import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { addDays, fromISODate, toISODate, todayISO } from '@/lib/dates';
import { colors, spacing } from '@/theme';

import { Chip } from './primitives';
import { IconButton } from './IconButton';
import { Pressable } from './Pressable';
import { Sheet } from './Sheet';
import { Text } from './Text';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** Lightweight calendar sheet (no native date-picker dependency). Dates are ISO YYYY-MM-DD. */
export function DateSheet({
  visible,
  onClose,
  value,
  onChange,
  maxDate = todayISO(),
}: {
  visible: boolean;
  onClose: () => void;
  value: string;
  onChange: (iso: string) => void;
  maxDate?: string;
}) {
  const initial = fromISODate(value);
  const [cursor, setCursor] = useState({ y: initial.getFullYear(), m: initial.getMonth() });

  const cells = useMemo(() => {
    const first = new Date(cursor.y, cursor.m, 1);
    const days = new Date(cursor.y, cursor.m + 1, 0).getDate();
    const out: (string | null)[] = Array.from({ length: first.getDay() }, () => null);
    for (let d = 1; d <= days; d++) out.push(toISODate(new Date(cursor.y, cursor.m, d)));
    return out;
  }, [cursor]);

  const monthLabel = new Date(cursor.y, cursor.m, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const pick = (iso: string) => {
    onChange(iso);
    onClose();
  };
  const shift = (delta: number) =>
    setCursor(({ y, m }) => ({ y: m + delta < 0 ? y - 1 : m + delta > 11 ? y + 1 : y, m: (m + delta + 12) % 12 }));

  return (
    <Sheet visible={visible} onClose={onClose} title="Date">
      <View style={{ paddingHorizontal: spacing.screen, gap: spacing['2xl'] }}>
        <View style={styles.quick}>
          <Chip label="Today" selected={value === todayISO()} onPress={() => pick(todayISO())} />
          <Chip
            label="Yesterday"
            selected={value === addDays(todayISO(), -1)}
            onPress={() => pick(addDays(todayISO(), -1))}
          />
        </View>
        <View style={styles.monthRow}>
          <IconButton icon="chevron-left" label="Previous month" onPress={() => shift(-1)} />
          <Text variant="section">{monthLabel}</Text>
          <IconButton
            icon="chevron-right"
            label="Next month"
            onPress={() => shift(1)}
            disabled={toISODate(new Date(cursor.y, cursor.m + 1, 1)) > maxDate}
          />
        </View>
        <View style={styles.grid}>
          {WEEKDAYS.map((w, i) => (
            <View key={`w${i}`} style={styles.cell}>
              <Text variant="caption" color={colors.textFaint}>
                {w}
              </Text>
            </View>
          ))}
          {cells.map((iso, i) => {
            if (!iso) return <View key={`e${i}`} style={styles.cell} />;
            const disabled = iso > maxDate;
            const selected = iso === value;
            return (
              <Pressable
                key={iso}
                disabled={disabled}
                onPress={() => pick(iso)}
                accessibilityLabel={fromISODate(iso).toDateString()}
                accessibilityState={{ selected, disabled }}
                style={[styles.cell, styles.day, selected && styles.selected]}
              >
                <Text
                  variant="bodyMedium"
                  color={selected ? colors.onDarkStrong : disabled ? colors.disabled : colors.ink}
                >
                  {Number(iso.slice(8))}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  quick: { flexDirection: 'row', gap: 8 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  day: { borderRadius: 999 },
  selected: { backgroundColor: colors.forest },
});
