import { getCalendars, getLocales } from 'expo-localization';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { api, errorMessage, type DateFormatPref, type NumberFormatPref } from '@/api';
import { Button, Card, IconTile, ListRow, Pressable, Screen, SelectSheet, Text, toast } from '@/components';
import { currencyLabel } from '@/domain/money';
import { AvatarPicker } from '@/features/profile/AvatarPicker';
import { t } from '@/i18n';
import {
  currencyOptions,
  dateFormatOptions,
  numberFormatOptions,
  REGIONS,
  regionName,
  regionOptions,
} from '@/features/profile/options';
import { chooseImage } from '@/lib/media';
import { track } from '@/lib/monitoring';
import { useCompleteOnboarding } from '@/queries';
import { useOnboardingDraft } from '@/stores/drafts';
import { useSession } from '@/stores/session';
import { colors, spacing } from '@/theme';

type Sheet = 'currency' | 'region' | 'number' | 'date' | null;

/** Sensible defaults from the device locale. */
function deviceDefaults() {
  const loc = getLocales()[0];
  const region = REGIONS.find((r) => r.code === loc?.regionCode) ?? REGIONS[0]!;
  return {
    region: region.code,
    currency: (loc?.currencyCode && /^[A-Z]{3}$/.test(loc.currencyCode) ? loc.currencyCode : region.currency) as string,
    numberFormat: region.numberFormat,
    dateFormat: region.dateFormat,
    timeZone: getCalendars()[0]?.timeZone ?? 'UTC',
  };
}

/** 06 — Preferences. Finishes onboarding (saves 04 + 06 together). */
export default function Preferences() {
  const profile = useSession((s) => s.me!.profile);
  const draft = useOnboardingDraft();
  const [defaults] = useState(deviceDefaults);
  const [currency, setCurrency] = useState(defaults.currency);
  const [region, setRegion] = useState(defaults.region);
  const [numberFormat, setNumberFormat] = useState<NumberFormatPref>(defaults.numberFormat);
  const [dateFormat, setDateFormat] = useState<DateFormatPref>(defaults.dateFormat);
  const [sheet, setSheet] = useState<Sheet>(null);
  const complete = useCompleteOnboarding();

  const finish = async () => {
    try {
      let avatarUrl = draft.avatarUri;
      // Upload a newly picked local photo; provider photos are already URLs.
      if (avatarUrl && !/^https?:/.test(avatarUrl)) {
        avatarUrl = await api.uploadAvatar({ uri: avatarUrl, mimeType: draft.avatarMime ?? 'image/jpeg' });
      }
      await complete.mutateAsync({
        fullName: draft.fullName || profile.fullName,
        phone: draft.phone || null,
        avatarUrl,
        defaultCurrency: currency,
        timeZone: defaults.timeZone,
        region,
        numberFormat,
        dateFormat,
      });
      track('onboarding_completed');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const pickPhoto = async () => {
    const file = await chooseImage('Profile photo', true);
    if (file) draft.set({ avatarUri: file.uri, avatarMime: file.mimeType });
  };

  const rows = [
    { key: 'currency' as const, icon: 'banknote', label: 'Default currency', value: currencyLabel(currency) },
    { key: 'region' as const, icon: 'globe', label: 'Region', value: regionName(region) },
    { key: 'number' as const, icon: 'hash', label: 'Number format', value: numberFormat },
    { key: 'date' as const, icon: 'calendar-days', label: 'Date format', value: dateFormat },
  ];

  return (
    <Screen
      padding={spacing.screenAuth}
      gap={22}
      footer={<Button label={t('Continue')} onPress={finish} loading={complete.isPending} />}
    >
      <View style={styles.top}>
        <View style={styles.progress} accessibilityLabel="Step 2 of 2">
          <View style={styles.bar} />
          <View style={styles.bar} />
        </View>
        <Pressable
          onPress={finish}
          accessibilityRole="button"
          accessibilityLabel="Skip and use defaults"
          hitSlop={12}
          scaleOnPress={false}
        >
          <Text variant="body" color={colors.textMuted}>
            {t('Skip')}
          </Text>
        </Pressable>
      </View>

      <View style={{ gap: 6 }}>
        <Text variant="h1" accessibilityRole="header">
          {t('Make it yours')}
        </Text>
        <Text variant="bodyLg" color={colors.textMuted}>
          {t('You can change these later in Settings.')}
        </Text>
      </View>

      <View style={styles.identity}>
        <AvatarPicker uri={draft.avatarUri} id={profile.id} name={draft.fullName} size={76} onPress={pickPhoto} />
        <View style={{ gap: 2 }}>
          <Text variant="nav">{draft.fullName || profile.fullName}</Text>
          <Text variant="secondary" color={colors.textMuted}>
            {draft.avatarUri ? 'Change profile photo' : 'Add a profile photo'}
          </Text>
        </View>
      </View>

      <Card>
        {rows.map((r, i) => (
          <ListRow
            key={r.key}
            label={r.label}
            title={r.value}
            left={<IconTile icon={r.icon} size={36} radius={10} />}
            chevron
            divider={i < rows.length - 1}
            paddingH={16}
            paddingV={16}
            onPress={() => setSheet(r.key)}
            accessibilityLabel={`${r.label}: ${r.value}`}
          />
        ))}
      </Card>

      <SelectSheet
        visible={sheet === 'currency'}
        onClose={() => setSheet(null)}
        title={t('Default currency')}
        options={currencyOptions}
        value={currency}
        onSelect={setCurrency}
        searchable
        searchPlaceholder="Search currencies"
      />
      <SelectSheet
        visible={sheet === 'region'}
        onClose={() => setSheet(null)}
        title={t('Region')}
        options={regionOptions}
        value={region}
        searchable
        searchPlaceholder="Search regions"
        onSelect={(code) => {
          const r = REGIONS.find((x) => x.code === code)!;
          setRegion(code);
          setNumberFormat(r.numberFormat);
          setDateFormat(r.dateFormat);
        }}
      />
      <SelectSheet
        visible={sheet === 'number'}
        onClose={() => setSheet(null)}
        title={t('Number format')}
        options={numberFormatOptions}
        value={numberFormat}
        onSelect={setNumberFormat}
      />
      <SelectSheet
        visible={sheet === 'date'}
        onClose={() => setSheet(null)}
        title={t('Date format')}
        options={dateFormatOptions}
        value={dateFormat}
        onSelect={setDateFormat}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progress: { flexDirection: 'row', gap: 5 },
  bar: { width: 28, height: 5, borderRadius: 3, backgroundColor: colors.forest },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 16 },
});
