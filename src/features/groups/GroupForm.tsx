import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { GroupType } from '@/api';
import { Chip, Field, Icon, Pressable, SelectSheet, Sheet, Text } from '@/components';
import { currencyLabel } from '@/domain/money';
import { GROUP_ICONS, GROUP_TYPES } from '@/features/expenses/categories';
import { currencyOptions } from '@/features/profile/options';
import { t } from '@/i18n';
import { colors, spacing } from '@/theme';

export interface GroupFormValue {
  name: string;
  type: GroupType;
  currency: string;
  icon: string;
}

/** Shared fields for Create group (12) and Group settings. */
export function GroupFormFields({
  value,
  onChange,
  nameError,
}: {
  value: GroupFormValue;
  onChange: (v: GroupFormValue) => void;
  nameError?: string | null;
}) {
  const [iconSheet, setIconSheet] = useState(false);
  const [currencySheet, setCurrencySheet] = useState(false);
  const set = (p: Partial<GroupFormValue>) => onChange({ ...value, ...p });

  return (
    <>
      <View style={styles.iconBlock}>
        <Pressable onPress={() => setIconSheet(true)} accessibilityLabel="Change icon" style={styles.iconTile}>
          <Icon name={value.icon} size={34} color={colors.mint} />
        </Pressable>
        <Pressable onPress={() => setIconSheet(true)} scaleOnPress={false} accessibilityRole="button" hitSlop={8}>
          <Text variant="secondaryMedium" color={colors.positive}>
            {t('Change icon')}
          </Text>
        </Pressable>
      </View>

      <Field
        label={t('Group name')}
        value={value.name}
        onChangeText={(name) => set({ name })}
        placeholder={t('e.g. Flatmates')}
        maxLength={60}
        autoCapitalize="words"
        error={nameError}
      />

      <View style={{ gap: 8 }}>
        <Text variant="secondary" color={colors.textMuted}>
          {t('Type')}
        </Text>
        <View style={styles.chips}>
          {GROUP_TYPES.map((t) => (
            <Chip
              key={t.value}
              label={t.label}
              selected={value.type === t.value}
              onPress={() => {
                // Follow the type's default icon unless the user picked a custom one.
                const isDefault = GROUP_TYPES.some((x) => x.icon === value.icon);
                set({ type: t.value, icon: isDefault ? t.icon : value.icon });
              }}
            />
          ))}
        </View>
      </View>

      <Field
        label={t('Group currency')}
        onPressSelect={() => setCurrencySheet(true)}
        selectValue={currencyLabel(value.currency)}
      />

      <SelectSheet
        visible={currencySheet}
        onClose={() => setCurrencySheet(false)}
        title={t('Group currency')}
        options={currencyOptions}
        value={value.currency}
        onSelect={(currency) => set({ currency })}
        searchable
        searchPlaceholder="Search currencies"
      />
      <Sheet visible={iconSheet} onClose={() => setIconSheet(false)} title={t('Choose an icon')}>
        <View style={styles.iconGrid}>
          {GROUP_ICONS.map((ic) => (
            <Pressable
              key={ic}
              onPress={() => {
                set({ icon: ic });
                setIconSheet(false);
              }}
              accessibilityLabel={ic}
              accessibilityState={{ selected: value.icon === ic }}
              style={[styles.iconChoice, value.icon === ic && styles.iconChoiceOn]}
            >
              <Icon name={ic} size={24} color={value.icon === ic ? colors.mint : colors.forest} />
            </Pressable>
          ))}
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  iconBlock: { alignItems: 'center', gap: 6 },
  iconTile: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: colors.forestCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingHorizontal: spacing.screen,
    paddingBottom: spacing.md,
  },
  iconChoice: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconChoiceOn: { backgroundColor: colors.forestCard },
});
