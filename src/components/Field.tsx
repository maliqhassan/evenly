import { useState, type ComponentRef, type Ref } from 'react';
import { StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';

import { colors, fontFamily, radii, sizes, spacing } from '@/theme';

import { Icon, type IconName } from './Icon';
import { Pressable } from './Pressable';
import { Text } from './Text';

export interface FieldProps extends Omit<TextInputProps, 'ref'> {
  ref?: Ref<ComponentRef<typeof TextInput>>;
  label?: string;
  error?: string | null;
  icon?: IconName;
  containerStyle?: StyleProp<ViewStyle>;
  /** Render as a tappable select (value + chevron) instead of an input. */
  onPressSelect?: () => void;
  selectValue?: string;
  variant?: 'outlined' | 'filled';
}

/** Labelled text input. Focus = 1.5pt forest border, as in the design. */
export function Field({
  label,
  error,
  icon,
  containerStyle,
  onPressSelect,
  selectValue,
  variant = 'outlined',
  style,
  onFocus,
  onBlur,
  ref,
  ...input
}: FieldProps) {
  const [focused, setFocused] = useState(false);
  const borderColor = error
    ? colors.negative
    : focused
      ? colors.forest
      : variant === 'outlined'
        ? colors.border
        : 'transparent';
  const borderWidth = focused || error ? 1.5 : variant === 'outlined' ? 1 : 0;

  return (
    <View style={[styles.wrap, containerStyle]}>
      {label ? (
        <Text variant="secondary" color={colors.textMuted}>
          {label}
        </Text>
      ) : null}
      {onPressSelect ? (
        <Pressable
          onPress={onPressSelect}
          scaleOnPress={false}
          accessibilityLabel={label ? `${label}: ${selectValue ?? ''}` : selectValue}
          style={[styles.box, { borderColor, borderWidth }]}
        >
          {icon ? <Icon name={icon} size={18} color={colors.textFaint} /> : null}
          <Text variant="bodyLg" style={{ flex: 1 }} numberOfLines={1}>
            {selectValue}
          </Text>
          <Icon name="chevron-down" size={18} color={colors.textFaint} />
        </Pressable>
      ) : (
        <View style={[styles.box, { borderColor, borderWidth }]}>
          {icon ? <Icon name={icon} size={18} color={colors.textFaint} /> : null}
          <TextInput
            ref={ref}
            placeholderTextColor={colors.textFaint}
            selectionColor={colors.positive}
            accessibilityLabel={label ?? input.placeholder}
            onFocus={(e) => {
              setFocused(true);
              onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              onBlur?.(e);
            }}
            style={[styles.input, style]}
            {...input}
          />
        </View>
      )}
      {error ? (
        <Text variant="caption" color={colors.negative} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/** Pill-shaped search input (Activity, Invite). */
export function SearchField({
  value,
  onChangeText,
  placeholder,
  bg = colors.bg,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  bg?: string;
}) {
  return (
    <View style={[styles.search, { backgroundColor: bg }]}>
      <Icon name="search" size={18} color={colors.textFaint} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        selectionColor={colors.positive}
        accessibilityLabel={placeholder}
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
        style={styles.searchInput}
      />
      {value ? (
        <Pressable onPress={() => onChangeText('')} accessibilityLabel="Clear search" hitSlop={10}>
          <Icon name="x" size={16} color={colors.textFaint} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  box: {
    height: sizes.input,
    borderRadius: radii.input,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing['3xl'],
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  input: { flex: 1, height: '100%', fontFamily: fontFamily.regular, fontSize: 15, color: colors.text, padding: 0 },
  search: { height: 46, borderRadius: 23, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 },
  searchInput: {
    flex: 1,
    height: '100%',
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.text,
    padding: 0,
  },
});
