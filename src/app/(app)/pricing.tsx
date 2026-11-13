import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { errorMessage } from '@/api';
import {
  AmountText,
  Button,
  Card,
  Header,
  Icon,
  Pressable,
  ProgressBar,
  Screen,
  Skeleton,
  Text,
  toast,
  type IconName,
} from '@/components';
import { PRO_PRICES, type PricingReason } from '@/features/plan';
import { usePreferences } from '@/hooks/usePreferences';
import { msg, t } from '@/i18n';
import { formatDate } from '@/lib/dates';
import { track } from '@/lib/monitoring';
import { usePlan, useSetPlan } from '@/queries';
import { colors, radii, spacing } from '@/theme';

type Billing = 'monthly' | 'yearly';

const REASONS: Record<Exclude<PricingReason, 'offer'>, string> = {
  groups: msg('Free includes {count} groups you create. Go Pro for unlimited groups.'),
  expenses: msg('Free includes {count} expenses a month. Go Pro for unlimited expenses.'),
  scan: msg('Receipt scanning is part of Pro.'),
  items: msg('Splitting by item is part of Pro.'),
  fx: msg('Totals across currencies are part of Pro.'),
  csv: msg('Importing from CSV is part of Pro.'),
};

/** Free vs Pro, row by row. `free: true` means included in Free. */
const FEATURES: { icon: IconName; label: string; free: string | boolean; pro: string | boolean }[] = [
  { icon: 'users', label: msg('Groups you create'), free: '{groups}', pro: msg('Unlimited') },
  { icon: 'receipt', label: msg('Expenses each month'), free: '{expenses}', pro: msg('Unlimited') },
  { icon: 'handshake', label: msg('Join groups, settle up, reminders'), free: true, pro: true },
  { icon: 'refresh-cw', label: msg('Recurring expenses and saved splits'), free: true, pro: true },
  { icon: 'scan-line', label: msg('Receipt scanning'), free: false, pro: true },
  { icon: 'list', label: msg('Split by item'), free: false, pro: true },
  { icon: 'globe', label: msg('Total across currencies'), free: false, pro: true },
  { icon: 'download', label: msg('Import from CSV'), free: false, pro: true },
];

/** Evenly Pro: what you get, your Free allowance, and (while testing) a switch. */
export default function Pricing() {
  const { reason } = useLocalSearchParams<{ reason?: PricingReason }>();
  const plan = usePlan();
  const setPlan = useSetPlan();
  const { dateFormat } = usePreferences();
  const [billing, setBilling] = useState<Billing>('yearly');

  const p = plan.data;
  const isPro = p?.plan === 'pro';
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const switchTo = async (next: 'free' | 'pro') => {
    try {
      await setPlan.mutateAsync(next);
      track('plan_switched', { plan: next, billing, reason: reason ?? 'none' });
      toast.success(next === 'pro' ? t('You’re on Pro') : t('You’re on Free'));
      if (next === 'pro') close();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const fill = (s: string) =>
    s
      .replace('{groups}', String(p?.groupLimit ?? 3))
      .replace('{expenses}', t('{count} a month', { count: p?.expenseLimit ?? 15 }));
  const reasonText =
    reason && reason !== 'offer'
      ? t(REASONS[reason], { count: reason === 'groups' ? (p?.groupLimit ?? 3) : (p?.expenseLimit ?? 15) })
      : null;
  const savePct = Math.round((1 - PRO_PRICES.yearly / (PRO_PRICES.monthly * 12)) * 100);

  return (
    <Screen
      gap={16}
      footer={
        <View style={{ gap: 8 }}>
          {isPro ? (
            <Button
              label={t('Switch back to Free')}
              variant="secondary"
              onPress={() => void switchTo('free')}
              loading={setPlan.isPending}
              disabled={!p?.selfService}
            />
          ) : (
            <Button
              label={p && !p.selfService ? t('Coming soon') : t('Switch to Pro')}
              onPress={() => void switchTo('pro')}
              loading={setPlan.isPending}
              disabled={!p?.selfService}
            />
          )}
          <Pressable onPress={close} accessibilityRole="button" style={styles.notNow}>
            <Text variant="bodyMedium" color={colors.textMuted}>
              {isPro ? t('Done') : t('Not now')}
            </Text>
          </Pressable>
        </View>
      }
    >
      <Header left="close" onLeft={close} />

      <View style={styles.hero}>
        <View style={styles.badge}>
          <Icon name="sparkles" size={14} color={colors.forest} />
          <Text variant="captionStrong" color={colors.forest}>
            {t('EVENLY PRO')}
          </Text>
        </View>
        <Text variant="h2" color={colors.onDarkStrong}>
          {isPro ? t('You’re on Pro') : t('Split without limits')}
        </Text>
        <Text variant="secondary" color={colors.onDarkMuted}>
          {isPro
            ? t('Unlimited groups and expenses, receipt scanning and every Pro tool. Thanks for your support.')
            : t('Unlimited groups and expenses, plus receipt scanning, item splits, currency totals and CSV import.')}
        </Text>
      </View>

      {reasonText ? (
        <View style={styles.reason}>
          <Icon name="lock" size={16} color={colors.warning} />
          <Text variant="secondaryMedium" style={{ flex: 1 }}>
            {reasonText}
          </Text>
        </View>
      ) : null}

      {!isPro ? (
        <Card radius={radii.card} padded>
          {p ? (
            <View style={{ gap: 12 }}>
              <Text variant="captionStrong" color={colors.textSubtle}>
                {t('YOUR FREE PLAN')}
              </Text>
              <Usage label={t('Expenses this month')} used={p.expensesUsed} limit={p.expenseLimit} />
              <Usage label={t('Groups you created')} used={p.groupsUsed} limit={p.groupLimit} />
              <Text variant="caption" color={colors.textFaint}>
                {t('Your expense count starts again on {date}.', { date: formatDate(p.resetsOn, dateFormat) })}
              </Text>
            </View>
          ) : (
            <Skeleton height={80} />
          )}
        </Card>
      ) : null}

      <Card radius={radii.card}>
        <View style={[styles.row, styles.divider]}>
          <Text variant="captionStrong" color={colors.textSubtle} style={{ flex: 1 }}>
            {t('FEATURE')}
          </Text>
          <Text variant="captionStrong" color={colors.textSubtle} style={styles.col} align="center">
            {t('Free')}
          </Text>
          <Text variant="captionStrong" color={colors.positive} style={styles.col} align="center">
            {t('Pro')}
          </Text>
        </View>
        {FEATURES.map((f, i) => (
          <View key={f.label} style={[styles.row, i < FEATURES.length - 1 && styles.divider]}>
            <Icon name={f.icon} size={16} color={colors.textMuted} />
            <Text variant="secondary" style={{ flex: 1 }}>
              {t(f.label)}
            </Text>
            <Cell value={f.free} fill={fill} />
            <Cell value={f.pro} fill={fill} pro />
          </View>
        ))}
      </Card>

      {!isPro ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <PriceOption
            selected={billing === 'monthly'}
            onPress={() => setBilling('monthly')}
            title={t('Monthly')}
            amount={PRO_PRICES.monthly}
            per={t('a month')}
          />
          <PriceOption
            selected={billing === 'yearly'}
            onPress={() => setBilling('yearly')}
            title={t('Yearly')}
            amount={PRO_PRICES.yearly}
            per={t('a year')}
            tag={t('Save {pct}%', { pct: savePct })}
          />
        </View>
      ) : null}

      <Text variant="caption" color={colors.textFaint} align="center">
        {t('Testing: no payment is taken. The switch changes your plan straight away.')}
      </Text>
    </Screen>
  );
}

function Usage({ label, used, limit }: { label: string; used: number; limit: number }) {
  const full = used >= limit;
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text variant="secondaryMedium">{label}</Text>
        <Text variant="secondaryStrong" color={full ? colors.negative : colors.ink}>
          {t('{used} of {limit}', { used: Math.min(used, limit), limit })}
        </Text>
      </View>
      <ProgressBar
        value={limit > 0 ? Math.min(1, used / limit) : 0}
        color={full ? colors.negative : colors.positive}
        track={colors.surfaceMuted}
      />
    </View>
  );
}

function Cell({ value, fill, pro }: { value: string | boolean; fill: (s: string) => string; pro?: boolean }) {
  if (typeof value === 'string')
    return (
      <Text
        variant="captionStrong"
        color={pro ? colors.positive : colors.textMuted}
        style={styles.col}
        align="center"
      >
        {fill(t(value))}
      </Text>
    );
  return (
    <View style={[styles.col, { alignItems: 'center' }]}>
      {value ? (
        <Icon name="check" size={16} color={colors.positive} />
      ) : (
        <Icon name="minus" size={16} color={colors.disabled} />
      )}
    </View>
  );
}

function PriceOption({
  selected,
  onPress,
  title,
  amount,
  per,
  tag,
}: {
  selected: boolean;
  onPress: () => void;
  title: string;
  amount: number;
  per: string;
  tag?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={title}
      style={[styles.price, selected && styles.priceOn]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <Text variant="secondaryStrong">{title}</Text>
        {tag ? (
          <View style={styles.tag}>
            <Text variant="captionStrong" color={colors.forest}>
              {tag}
            </Text>
          </View>
        ) : null}
      </View>
      <AmountText minor={amount} currency={PRO_PRICES.currency} tone="neutral" variant="section" sign="never" />
      <Text variant="caption" color={colors.textSubtle}>
        {per}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: {
    padding: spacing['5xl'],
    borderRadius: radii.cardXl,
    backgroundColor: colors.forestCard,
    gap: 8,
  },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.mint,
  },
  reason: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: radii.card,
    backgroundColor: colors.warningSoft,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  col: { width: 72 },
  price: {
    flex: 1,
    padding: 14,
    gap: 4,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    minHeight: 44,
  },
  priceOn: { borderColor: colors.positive, backgroundColor: colors.positiveSoft },
  notNow: { height: 44, alignItems: 'center', justifyContent: 'center' },
  tag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radii.pill, backgroundColor: colors.mint },
});
