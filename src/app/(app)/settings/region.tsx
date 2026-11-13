import { useState } from 'react';

import { errorMessage, type DateFormatPref, type NumberFormatPref } from '@/api';
import { Card, Header, IconTile, InfoNote, ListRow, Screen, SelectSheet, toast } from '@/components';
import { currencyLabel } from '@/domain/money';
import { t } from '@/i18n';
import {
  currencyOptions,
  dateFormatOptions,
  numberFormatOptions,
  regionName,
  regionOptions,
} from '@/features/profile/options';
import { useUpdateDefaultCurrency, useUpdatePreferences } from '@/queries';
import { useSession } from '@/stores/session';

type SheetName = 'currency' | 'region' | 'number' | 'date' | null;

/** Currency & region preferences. Saved immediately. */
export default function RegionSettings() {
  const me = useSession((s) => s.me!);
  const prefs = useUpdatePreferences();
  const currency = useUpdateDefaultCurrency();
  const [sheet, setSheet] = useState<SheetName>(null);
  const onError = (e: unknown) => toast.error(errorMessage(e));

  const rows = [
    {
      key: 'currency' as const,
      icon: 'banknote',
      label: 'Default currency',
      value: currencyLabel(me.profile.defaultCurrency),
    },
    { key: 'region' as const, icon: 'globe', label: 'Region', value: regionName(me.preferences.region) },
    { key: 'number' as const, icon: 'hash', label: 'Number format', value: me.preferences.numberFormat },
    { key: 'date' as const, icon: 'calendar-days', label: 'Date format', value: me.preferences.dateFormat },
  ];

  return (
    <Screen>
      <Header title={t('Currency & region')} />
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
          />
        ))}
      </Card>
      <InfoNote>
        {t(
          'Your default currency is used for new groups and your dashboard. Balances in other currencies are always shown separately — Evenly never converts them silently.',
        )}
      </InfoNote>

      <SelectSheet
        visible={sheet === 'currency'}
        onClose={() => setSheet(null)}
        title="Default currency"
        options={currencyOptions}
        value={me.profile.defaultCurrency}
        onSelect={(c) => currency.mutate(c, { onError })}
        searchable
      />
      <SelectSheet
        visible={sheet === 'region'}
        onClose={() => setSheet(null)}
        title="Region"
        options={regionOptions}
        value={me.preferences.region}
        onSelect={(region) => prefs.mutate({ region }, { onError })}
        searchable
      />
      <SelectSheet
        visible={sheet === 'number'}
        onClose={() => setSheet(null)}
        title="Number format"
        options={numberFormatOptions}
        value={me.preferences.numberFormat}
        onSelect={(v: NumberFormatPref) => prefs.mutate({ numberFormat: v }, { onError })}
      />
      <SelectSheet
        visible={sheet === 'date'}
        onClose={() => setSheet(null)}
        title="Date format"
        options={dateFormatOptions}
        value={me.preferences.dateFormat}
        onSelect={(v: DateFormatPref) => prefs.mutate({ dateFormat: v }, { onError })}
      />
    </Screen>
  );
}
