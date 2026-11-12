import { useMemo, useState } from 'react';
import { FlatList, Modal, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { colors, radii, spacing } from '@/theme';

import { SearchField } from './Field';
import { Icon, type IconName } from './Icon';
import { Pressable } from './Pressable';
import { Text } from './Text';

interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Max height as a fraction of the screen. */
  tall?: boolean;
}

/** Bottom sheet built on RN Modal (no extra native dependency). */
export function Sheet({ visible, onClose, title, children, tall }: SheetProps) {
  const insets = useSafeAreaInsets();
  // Android (edge-to-edge): the modal window isn't resized for the keyboard, so
  // lift the sheet above it and let it use the space that is left.
  const keyboard = useKeyboardHeight();
  const keyboardInset = keyboard > 0 ? keyboard + insets.bottom : 0;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.backdrop, { paddingBottom: keyboardInset }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} scaleOnPress={false} accessibilityLabel="Close" />
        <View style={[styles.fit, { paddingTop: insets.top + spacing.xl }]} pointerEvents="box-none">
          <View
            style={[
              styles.sheet,
              keyboardInset
                ? { paddingBottom: spacing.xl, maxHeight: '100%' }
                : { paddingBottom: insets.bottom + spacing['3xl'], maxHeight: tall ? '88%' : '75%' },
            ]}
          >
            <View style={styles.grabber} />
            {title ? (
              <View style={styles.titleRow}>
                <Text variant="nav" accessibilityRole="header">
                  {title}
                </Text>
                <Pressable onPress={onClose} accessibilityLabel="Close" hitSlop={12} style={styles.close}>
                  <Icon name="x" size={18} color={colors.ink} />
                </Pressable>
              </View>
            ) : null}
            {children}
          </View>
        </View>
      </View>
    </Modal>
  );
}

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  description?: string;
  icon?: IconName | string;
  left?: React.ReactNode;
}

interface SelectSheetProps<T extends string> {
  visible: boolean;
  onClose: () => void;
  title: string;
  options: readonly SelectOption<T>[];
  value?: T | null;
  onSelect: (value: T) => void;
  searchable?: boolean;
  searchPlaceholder?: string;
}

/** Single-choice list in a sheet (currency, region, payer, category…). */
export function SelectSheet<T extends string>({
  visible,
  onClose,
  title,
  options,
  value,
  onSelect,
  searchable,
  searchPlaceholder = 'Search',
}: SelectSheetProps<T>) {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s
      ? options.filter((o) => `${o.label} ${o.description ?? ''} ${o.value}`.toLowerCase().includes(s))
      : options;
  }, [q, options]);

  return (
    <Sheet visible={visible} onClose={onClose} title={title} tall={searchable}>
      {searchable ? (
        <View style={{ paddingHorizontal: spacing.screen, paddingBottom: spacing.md }}>
          <SearchField value={q} onChangeText={setQ} placeholder={searchPlaceholder} />
        </View>
      ) : null}
      <FlatList
        data={filtered}
        keyExtractor={(o) => o.value}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: spacing.screen }}
        renderItem={({ item }) => {
          const selected = item.value === value;
          return (
            <Pressable
              onPress={() => {
                onSelect(item.value);
                setQ('');
                onClose();
              }}
              scaleOnPress={false}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={item.label}
              style={styles.option}
            >
              {item.left}
              {item.icon ? (
                <View style={styles.optionIcon}>
                  <Icon name={item.icon} size={18} color={colors.forest} />
                </View>
              ) : null}
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="bodyLgMedium">{item.label}</Text>
                {item.description ? (
                  <Text variant="caption" color={colors.textSubtle}>
                    {item.description}
                  </Text>
                ) : null}
              </View>
              {selected ? <Icon name="check" size={18} color={colors.positive} /> : null}
            </Pressable>
          );
        }}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.scrim },
  // The area the sheet may occupy: below the status bar, above the keyboard.
  fit: { flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: spacing.md },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.disabled,
    marginBottom: spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.screen,
    paddingVertical: spacing.lg,
  },
  close: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xl,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceMuted2,
    minHeight: 52,
  },
  optionIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
