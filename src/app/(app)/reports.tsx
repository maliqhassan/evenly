import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  alert,
  AmountText,
  Card,
  EmptyState,
  Header,
  Icon,
  Pressable,
  ProgressBar,
  Screen,
  SelectSheet,
  Skeleton,
  Text,
} from '@/components';
import { formatMoney, type CurrencyCode } from '@/domain/money';
import { usePreferences } from '@/hooks/usePreferences';
import { t } from '@/i18n';
import { monthLong, monthShort } from '@/lib/dates';
import { useBalances, useGroups, useSpendingReport } from '@/queries';
import { colors, radii } from '@/theme';

/** 22 — Reports: my share by month and by category, per currency. */
export default function Reports() {
  const { currency: preferred, locale } = usePreferences();
  const groups = useGroups();
  const balances = useBalances();
  const [currency, setCurrency] = useState<CurrencyCode>(preferred);
  const [pick, setPick] = useState(false);
  const report = useSpendingReport(currency, 6);

  const currencies = useMemo(() => {
    const set = new Set<string>([
      preferred,
      ...(groups.data ?? []).map((g) => g.currency),
      ...(balances.data ?? []).map((b) => b.currency),
    ]);
    return [...set];
  }, [preferred, groups.data, balances.data]);

  const months = report.data?.months ?? [];
  const current = months[months.length - 1];
  const previous = months[months.length - 2];
  const max = Math.max(1, ...months.map((m) => m.share));
  const change =
    previous && previous.share > 0 && current ? ((current.share - previous.share) / previous.share) * 100 : null;

  // Top four categories + "Other".
  const cats = useMemo(() => {
    const list = report.data?.categories ?? [];
    const top = list.slice(0, 4);
    const rest = list.slice(4).reduce((s, c) => s + c.share, 0);
    const rows = rest > 0 ? [...top, { categoryId: 'other', name: 'Other', icon: 'receipt', share: rest }] : top;
    const total = rows.reduce((s, c) => s + c.share, 0);
    const maxShare = Math.max(1, ...rows.map((r) => r.share));
    return rows.map((r, i) => ({
      ...r,
      pct: total ? Math.round((r.share / total) * 100) : 0,
      w: r.share / maxShare,
      color: colors.categoryScale[i] ?? colors.categoryScale[4],
    }));
  }, [report.data]);

  return (
    <Screen gap={16} refreshing={report.isRefetching} onRefresh={() => report.refetch()}>
      <Header
        title={t('Reports')}
        right={
          <Pressable
            onPress={() =>
              alert('CSV export', 'Exporting your expenses to CSV is part of Evenly Plus and is coming soon.')
            }
            accessibilityLabel="Export CSV (Evenly Plus)"
            style={styles.csv}
          >
            <Icon name="download" size={15} color={colors.ink} />
            <Text variant="captionStrong">CSV</Text>
          </Pressable>
        }
      />

      <View style={styles.dark}>
        <View style={styles.darkTop}>
          <View style={{ gap: 4, flex: 1 }}>
            <Text variant="caption" color={colors.onDarkMuted}>
              Your share · {current ? monthLong(current.month) : '—'}
            </Text>
            {report.isLoading ? (
              <Skeleton width={160} height={32} style={{ opacity: 0.3 }} />
            ) : (
              <AmountText
                minor={current?.share ?? 0}
                currency={currency}
                color={colors.onDark}
                variant="h1"
                style={{ fontSize: 32 }}
              />
            )}
            {change !== null ? (
              <Text variant="caption" color={change > 0 ? colors.onDarkPositive : colors.onDarkMuted}>
                {change > 0 ? '+' : ''}
                {change.toFixed(1)}% vs {monthLong(previous!.month)}
              </Text>
            ) : null}
          </View>
          <Pressable onPress={() => setPick(true)} accessibilityLabel={`Currency ${currency}`} style={styles.curPill}>
            <Text variant="caption" color={colors.onDark}>
              {currency}
            </Text>
            <Icon name="chevron-down" size={14} color={colors.onDark} />
          </Pressable>
        </View>
        <View
          style={styles.chart}
          accessibilityRole="image"
          accessibilityLabel={`Monthly share: ${months.map((m) => `${monthShort(m.month)} ${formatMoney(m.share, currency, { locale })}`).join(', ')}`}
        >
          {months.map((m, i) => {
            const last = i === months.length - 1;
            return (
              <View key={m.month} style={styles.barCol}>
                <View
                  style={[
                    styles.bar,
                    {
                      height: `${Math.max(4, (m.share / max) * 100)}%`,
                      backgroundColor: last ? colors.chartBarActive : colors.chartBarMuted,
                    },
                  ]}
                />
                <Text variant="micro" color={colors.onDarkMuted}>
                  {monthShort(m.month)}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      <Card padded style={{ gap: 14 }}>
        <Text variant="bodyLgStrong">{t('By category')}</Text>
        {report.isLoading ? (
          <Skeleton height={60} />
        ) : cats.length === 0 ? (
          <EmptyState
            icon="chart-pie"
            title={t('Nothing this month yet')}
            body={`Expenses you share in ${currency} will be broken down here.`}
          />
        ) : (
          cats.map((c) => (
            <View key={c.categoryId} style={{ gap: 6 }}>
              <View style={styles.catTop}>
                <Text variant="secondaryMedium">{c.name}</Text>
                <Text variant="secondary">
                  <Text variant="secondary" color={colors.textFaint}>
                    {c.pct}% ·{' '}
                  </Text>
                  <Text variant="secondaryStrong" tabular>
                    {formatMoney(c.share, currency, { locale })}
                  </Text>
                </Text>
              </View>
              <ProgressBar value={c.w} color={c.color} track={colors.dividerStrong} />
            </View>
          ))
        )}
      </Card>

      <SelectSheet
        visible={pick}
        onClose={() => setPick(false)}
        title={t('Report currency')}
        options={currencies.map((c) => ({ value: c, label: c }))}
        value={currency}
        onSelect={setCurrency}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  csv: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 44,
  },
  dark: { backgroundColor: colors.forestCard, borderRadius: radii.cardXl + 2, padding: 18, gap: 16 },
  darkTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  curPill: {
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: colors.onDarkTranslucent,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, height: 110 },
  barCol: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
  bar: { width: '100%', borderRadius: 8 },
  catTop: { flexDirection: 'row', justifyContent: 'space-between' },
});
