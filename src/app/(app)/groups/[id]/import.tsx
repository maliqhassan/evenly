import { useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { api } from '@/api';
import {
  AmountText,
  Button,
  Card,
  Checkbox,
  Header,
  Icon,
  ListRow,
  Overline,
  Pressable,
  Screen,
  Segmented,
  SelectSheet,
  Text,
  toast,
} from '@/components';
import { buildImportRows, guessColumns, looksLikeHeader, parseCsv, type ColumnMap, type ImportRow } from '@/domain/csv';
import { formatMoney, splitEqual } from '@/domain/money';
import { activeMembers, usePeople } from '@/features/people';
import { usePreferences } from '@/hooks/usePreferences';
import { msg, t } from '@/i18n';
import { formatDate, todayISO } from '@/lib/dates';
import { dateOrderFor } from '@/lib/receipt-scan';
import { invalidateLedger, useGroup } from '@/queries';
import { useSession } from '@/stores/session';
import { colors, radii } from '@/theme';

const MAX_ROWS = 300;
type Field = 'date' | 'description' | 'amount' | 'payer';

const SKIP_LABEL: Record<NonNullable<ImportRow['skip']>, string> = {
  not_spending: msg('Money in, not spending'),
  no_amount: msg('No amount'),
  no_date: msg('Date not recognised'),
  other_currency: msg('Other currency'),
};

/** A stable id per row, so importing the same file twice never duplicates expenses. */
async function clientIdFor(groupId: string, r: ImportRow): Promise<string> {
  const h = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${groupId}|${r.line}|${r.date ?? ''}|${r.description}|${r.amount}`,
  );
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Import expenses from a CSV (spreadsheet or bank export) into a group. */
export default function ImportCsv() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const myId = useSession((s) => s.me!.profile.id);
  const { group } = useGroup(id);
  const people = usePeople();
  const { locale, dateFormat } = usePreferences();
  const qc = useQueryClient();

  const [file, setFile] = useState<{ name: string; header: string[]; rows: string[][] } | null>(null);
  const [map, setMap] = useState<ColumnMap | null>(null);
  const [spending, setSpending] = useState<'negative' | 'positive'>('negative');
  const [paidBy, setPaidBy] = useState(myId);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [sheet, setSheet] = useState<Field | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  const currency = group?.currency ?? 'USD';
  const members = useMemo(() => {
    const ids = group ? activeMembers(group).map((m) => m.profileId) : [];
    return [myId, ...ids.filter((x) => x !== myId)].filter((x) => ids.includes(x));
  }, [group, myId]);

  const rows = useMemo(
    () =>
      file && map ? buildImportRows(file.rows, map, { currency, dateOrder: dateOrderFor(dateFormat), spending }) : [],
    [file, map, currency, dateFormat, spending],
  );
  const toImport = rows.filter((r) => !r.skip && !excluded.has(r.line));
  const skipped = rows.filter((r) => r.skip);
  const total = toImport.reduce((s, r) => s + r.amount, 0);

  const pick = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: ['text/csv', 'text/comma-separated-values', 'text/plain', 'application/vnd.ms-excel'],
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets[0]) return;
    try {
      const text = await new File(res.assets[0].uri).text();
      const all = parseCsv(text);
      if (all.length === 0) throw new Error('empty');
      const hasHeader = looksLikeHeader(all[0]!, currency);
      const header = hasHeader ? all[0]! : all[0]!.map((_, i) => `${t('Column')} ${i + 1}`);
      const data = (hasHeader ? all.slice(1) : all).slice(0, MAX_ROWS);
      const guess = guessColumns(header);
      setFile({ name: res.assets[0].name, header, rows: data });
      setMap(guess);
      setExcluded(new Set());
    } catch {
      toast.error(t('Couldn’t read this file. Save it as CSV and try again.'));
    }
  };

  const columnName = (i: number | null) =>
    i === null || !file ? t('None') : file.header[i] || `${t('Column')} ${i + 1}`;
  const columnOptions = file
    ? [
        { value: '-1', label: t('None') },
        ...file.header.map((h, i) => ({
          value: String(i),
          label: h || `${t('Column')} ${i + 1}`,
          description: file.rows[0]?.[i] ? `${file.rows[0][i]}` : undefined,
        })),
      ]
    : [];
  const usesDebit = !!map && map.amount === null && map.debit !== null;

  const setColumn = (field: Field, value: string) => {
    if (!map) return;
    const i = value === '-1' ? null : Number(value);
    if (field === 'amount') setMap({ ...map, amount: i, debit: null, credit: null });
    else if (field === 'date' || field === 'description') setMap({ ...map, [field]: i });
  };

  const runImport = async () => {
    if (!group || toImport.length === 0) return;
    setProgress(0);
    let failed = 0;
    for (const [n, r] of toImport.entries()) {
      try {
        await api.saveExpense({
          groupId: group.id,
          clientId: await clientIdFor(group.id, r),
          description: r.description,
          amount: r.amount,
          currency,
          paidBy,
          splits: splitEqual(r.amount, members).map((a) => ({ profileId: a.id, amount: a.amount, inputValue: null })),
          splitMethod: 'equal',
          categoryId: 'general',
          date: r.date ?? todayISO(),
          notes: null,
        });
      } catch {
        failed++;
      }
      setProgress(n + 1);
    }
    invalidateLedger(qc, group.id);
    setProgress(null);
    const done = toImport.length - failed;
    if (done > 0) toast.success(t('{count} expenses imported', { count: done }));
    if (failed > 0) toast.error(t('{count} could not be imported', { count: failed }));
    if (failed === 0) router.back();
  };

  const importing = progress !== null;

  return (
    <Screen
      gap={16}
      footer={
        file ? (
          <Button
            label={
              importing
                ? t('Importing {done} of {count}…', { done: progress, count: toImport.length })
                : t('Import {count} expenses', { count: toImport.length })
            }
            onPress={runImport}
            disabled={importing || toImport.length === 0 || members.length === 0}
          />
        ) : undefined
      }
    >
      <Header title={t('Import from CSV')} subtitle={group?.name} />
      <Text variant="secondary" color={colors.textMuted}>
        {t(
          'Import expenses from a spreadsheet or bank export. Each row becomes an expense split equally between everyone in this group.',
        )}
      </Text>

      {!file ? (
        <Button label={t('Choose CSV file')} icon="file-text" onPress={() => void pick()} />
      ) : (
        <>
          <Card padded radius={radii.card} style={styles.fileRow}>
            <Icon name="file-text" size={20} color={colors.forest} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="bodyMedium" numberOfLines={1}>
                {file.name}
              </Text>
              <Text variant="caption" color={colors.textSubtle}>
                {t('{count} rows', { count: file.rows.length })}
              </Text>
            </View>
            <Pressable onPress={() => void pick()} accessibilityRole="button" hitSlop={8} disabled={importing}>
              <Text variant="captionStrong" color={colors.positive}>
                {t('Choose another file')}
              </Text>
            </Pressable>
          </Card>

          <View style={{ gap: 8 }}>
            <Overline>{t('COLUMNS')}</Overline>
            <Card radius={radii.card}>
              <ListRow
                label={t('Date')}
                title={columnName(map?.date ?? null)}
                chevron
                divider
                paddingH={16}
                onPress={() => setSheet('date')}
              />
              <ListRow
                label={t('Description')}
                title={columnName(map?.description ?? null)}
                chevron
                divider
                paddingH={16}
                onPress={() => setSheet('description')}
              />
              <ListRow
                label={usesDebit ? t('Money out') : t('Amount')}
                title={columnName(usesDebit ? (map?.debit ?? null) : (map?.amount ?? null))}
                chevron
                divider
                paddingH={16}
                onPress={() => setSheet('amount')}
              />
              <ListRow
                label={t('Paid by')}
                title={people.label(paidBy)}
                chevron
                divider={false}
                paddingH={16}
                onPress={() => setSheet('payer')}
              />
            </Card>
            {!usesDebit ? (
              <View style={{ gap: 6 }}>
                <Text variant="caption" color={colors.textSubtle}>
                  {t('Spending is')}
                </Text>
                <Segmented
                  value={spending}
                  onChange={(v) => setSpending(v as 'negative' | 'positive')}
                  options={[
                    { value: 'negative', label: t('Negative amounts') },
                    { value: 'positive', label: t('Positive amounts') },
                  ]}
                />
              </View>
            ) : null}
          </View>

          <View style={{ gap: 8 }}>
            <Overline>{t('PREVIEW')}</Overline>
            <Text variant="bodyStrong">
              {t('{count} to import · {total}', {
                count: toImport.length,
                total: formatMoney(total, currency, { locale }),
              })}
            </Text>
            <Text variant="caption" color={colors.textSubtle}>
              {t('Split equally between everyone in this group')} ·{' '}
              {t('Importing the same file again won’t add duplicates.')}
            </Text>
            <Card radius={radii.card}>
              {rows
                .filter((r) => !r.skip)
                .slice(0, 40)
                .map((r, i, arr) => {
                  const on = !excluded.has(r.line);
                  return (
                    <View key={r.line} style={[styles.row, i < arr.length - 1 && styles.divider]}>
                      <Checkbox
                        checked={on}
                        label={r.description}
                        onPress={() =>
                          setExcluded((s) => {
                            const next = new Set(s);
                            if (next.has(r.line)) next.delete(r.line);
                            else next.add(r.line);
                            return next;
                          })
                        }
                      />
                      <View style={{ flex: 1, minWidth: 0, opacity: on ? 1 : 0.5 }}>
                        <Text variant="bodyMedium" numberOfLines={1}>
                          {r.description}
                        </Text>
                        <Text variant="caption" color={colors.textSubtle}>
                          {r.date ? formatDate(r.date, dateFormat) : t('Today')}
                        </Text>
                      </View>
                      <AmountText minor={r.amount} currency={currency} variant="bodyMedium" />
                    </View>
                  );
                })}
            </Card>
            {skipped.length > 0 ? (
              <Text variant="caption" color={colors.textSubtle}>
                {t('{count} rows skipped', { count: skipped.length })}:{' '}
                {[...new Set(skipped.map((r) => r.skip!))].map((k) => t(SKIP_LABEL[k])).join(', ')}
              </Text>
            ) : null}
          </View>
        </>
      )}

      <SelectSheet
        visible={sheet === 'date' || sheet === 'description' || sheet === 'amount'}
        onClose={() => setSheet(null)}
        title={sheet === 'date' ? t('Date') : sheet === 'description' ? t('Description') : t('Amount')}
        options={columnOptions}
        value={
          sheet && map
            ? String(
                (sheet === 'amount' ? (usesDebit ? map.debit : map.amount) : map[sheet as 'date' | 'description']) ??
                  -1,
              )
            : undefined
        }
        onSelect={(v) => sheet && setColumn(sheet, v)}
      />
      <SelectSheet
        visible={sheet === 'payer'}
        onClose={() => setSheet(null)}
        title={t('Paid by')}
        options={members.map((m) => ({ value: m, label: people.label(m) }))}
        value={paidBy}
        onSelect={setPaidBy}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 14 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
});
