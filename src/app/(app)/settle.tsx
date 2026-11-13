import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { errorMessage } from '@/api';
import {
  AmountText,
  Avatar,
  Button,
  EmptyState,
  Header,
  Icon,
  IconButton,
  Pill,
  Screen,
  SectionHeader,
  SkeletonRows,
  Text,
  toast,
} from '@/components';
import { myDebts, type Debt } from '@/domain/ledger';
import { formatMoney, type CurrencyCode } from '@/domain/money';
import { usePeople } from '@/features/people';
import { usePreferences } from '@/hooks/usePreferences';
import { t } from '@/i18n';
import { useAwaitingMe, useBalances, useGroups, useRespondSettlement } from '@/queries';
import { colors, radii } from '@/theme';

/** 19 — Settle up (all groups, or one group via ?groupId=). */
export default function SettleUp() {
  const { groupId } = useLocalSearchParams<{ groupId?: string }>();
  const people = usePeople();
  const { currency: preferred, locale } = usePreferences();
  const balances = useBalances();
  const groups = useGroups();
  const awaiting = useAwaitingMe();
  const respond = useRespondSettlement();

  const debts = useMemo(
    () => myDebts(balances.data ?? [], people.myId).filter((d) => !groupId || d.groupId === groupId),
    [balances.data, people.myId, groupId],
  );
  const iOwe = debts.filter((d) => d.from === people.myId).sort((a, b) => b.amount - a.amount);
  const owedToMe = debts.filter((d) => d.to === people.myId).sort((a, b) => b.amount - a.amount);
  const toConfirm = (awaiting.data ?? []).filter((s) => !groupId || s.groupId === groupId);
  const groupName = (id: string) => groups.data?.find((g) => g.id === id)?.name ?? '';

  // Total you owe, per currency — never combined.
  const totals = useMemo(() => {
    const m = new Map<CurrencyCode, number>();
    for (const d of iOwe) m.set(d.currency, (m.get(d.currency) ?? 0) + d.amount);
    const list = [...m.entries()].map(([currency, amount]) => ({ currency, amount }));
    return list.sort((a, b) => (a.currency === preferred ? -1 : b.currency === preferred ? 1 : b.amount - a.amount));
  }, [iOwe, preferred]);
  const primary = totals[0] ?? { currency: preferred, amount: 0 };

  const pay = (d: Debt) =>
    router.push({
      pathname: '/record-payment',
      params: { groupId: d.groupId, from: d.from, to: d.to, amount: String(d.amount), currency: d.currency },
    });

  const answer = async (id: string, gid: string, confirm: boolean) => {
    try {
      await respond.mutateAsync({ id, confirm, groupId: gid });
      toast.success(confirm ? t('Payment confirmed') : t('Payment declined'));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Screen
      bg={colors.surface}
      refreshing={balances.isRefetching}
      onRefresh={() => {
        void balances.refetch();
        void awaiting.refetch();
      }}
    >
      <Header
        tone="muted"
        right={
          <IconButton
            icon="ellipsis-vertical"
            tone="plain"
            label={t('Settlement history')}
            onPress={() => router.push('/activity')}
          />
        }
      />
      <View style={{ alignItems: 'center', gap: 4 }}>
        <Text variant="h1" accessibilityRole="header">
          {t('Settle Up')}
        </Text>
        <Text variant="body" color={colors.textSubtle}>
          {groupId ? groupName(groupId) || t('Clear your balances in one tap') : t('Clear your balances in one tap')}
        </Text>
      </View>

      <View style={styles.oweCard}>
        <View style={{ gap: 4, flex: 1 }}>
          <Text variant="overlineSm" color={colors.textMuted}>
            {t('TOTAL YOU OWE')}
          </Text>
          <AmountText
            minor={primary.amount}
            currency={primary.currency}
            tone={primary.amount > 0 ? 'negative' : 'neutral'}
            variant="h1"
          />
          {totals.slice(1).map((t) => (
            <Text key={t.currency} variant="caption" color={colors.textMuted}>
              + {formatMoney(t.amount, t.currency, { locale })} in {t.currency}
            </Text>
          ))}
        </View>
        <View style={styles.alertIcon}>
          <Icon
            name={primary.amount > 0 ? 'triangle-alert' : 'circle-check'}
            size={20}
            color={primary.amount > 0 ? colors.negative : colors.positive}
          />
        </View>
      </View>

      {toConfirm.length ? (
        <View style={{ gap: 10 }}>
          <SectionHeader
            title={t('Awaiting your confirmation')}
            right={<Pill label={`${toConfirm.length} to review`} tone="warning" variant="soft" />}
          />
          {toConfirm.map((s) => (
            <View key={s.id} style={styles.card}>
              <View style={styles.cardTop}>
                <Avatar id={s.from} name={people.get(s.from).name} uri={people.get(s.from).avatarUrl} size={40} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="bodyLgStrong">
                    {t('{name} says they paid you', { name: people.get(s.from).firstName })}
                  </Text>
                  <Text variant="caption" color={colors.textSubtle}>
                    {groupName(s.groupId)} · {s.method.replace('_', ' ')}
                    {s.reference ? ` · ${s.reference}` : ''}
                  </Text>
                </View>
                <AmountText minor={s.amount} currency={s.currency} variant="nav" />
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button
                  label={t('Confirm')}
                  size="md"
                  style={{ flex: 1 }}
                  onPress={() => answer(s.id, s.groupId, true)}
                />
                <Button
                  label={t('Not received')}
                  size="md"
                  variant="secondary"
                  style={{ flex: 1 }}
                  onPress={() => answer(s.id, s.groupId, false)}
                />
              </View>
            </View>
          ))}
        </View>
      ) : null}

      <View style={{ gap: 10 }}>
        <SectionHeader
          title={t('Pending settlements')}
          right={iOwe.length ? <Pill label={`${iOwe.length} pending`} tone="positive" variant="soft" /> : undefined}
        />
        {balances.isLoading ? (
          <SkeletonRows count={3} bg={colors.bg} />
        ) : iOwe.length === 0 ? (
          <View style={styles.card}>
            <EmptyState
              icon="circle-check"
              title={t('You don’t owe anyone')}
              body={owedToMe.length ? t('Others still owe you — see below.') : t('Everyone is settled up.')}
            />
          </View>
        ) : (
          iOwe.map((d) => (
            <DebtCard
              key={`${d.groupId}-${d.to}-${d.currency}`}
              debt={d}
              note={groupName(d.groupId)}
              onPay={() => pay(d)}
            />
          ))
        )}
      </View>

      {owedToMe.length ? (
        <View style={{ gap: 10 }}>
          <SectionHeader title={t('Owed to you')} />
          {owedToMe.map((d) => (
            <View key={`${d.groupId}-${d.from}-${d.currency}`} style={[styles.card, styles.owedRow]}>
              <Avatar id={d.from} name={people.get(d.from).name} uri={people.get(d.from).avatarUrl} size={40} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="bodyLgStrong">{t('{name} owes you', { name: people.get(d.from).firstName })}</Text>
                <Text variant="caption" color={colors.textSubtle}>
                  {groupName(d.groupId)}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <AmountText minor={d.amount} currency={d.currency} tone="positive" variant="bodyLgStrong" />
                <Button
                  label={t('Record payment')}
                  size="sm"
                  variant="secondary"
                  fullWidth={false}
                  onPress={() => pay(d)}
                />
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

function DebtCard({ debt, note, onPay }: { debt: Debt; note: string; onPay: () => void }) {
  const people = usePeople();
  const me = people.get(people.myId);
  const to = people.get(debt.to);
  return (
    <View style={styles.card} accessibilityLabel={`You owe ${to.firstName}`}>
      <View style={styles.cardTop}>
        <Avatar id={me.id} name={me.name} uri={me.avatarUrl} size={40} />
        <View style={styles.dash} />
        <View style={styles.coin}>
          <Icon name="dollar-sign" size={11} color={colors.textFaint} />
        </View>
        <View style={styles.dash} />
        <Avatar id={to.id} name={to.name} uri={to.avatarUrl} size={40} />
        <View style={{ flex: 1, alignItems: 'flex-end', gap: 4 }}>
          <AmountText minor={debt.amount} currency={debt.currency} variant="bodyLgStrong" style={{ fontSize: 19 }} />
          <Pill label={t('Pending')} tone="negative" />
        </View>
      </View>
      <View style={styles.cardBottom}>
        <View style={{ gap: 2, flex: 1 }}>
          <Text variant="bodyLgStrong">{t('You to {name}', { name: to.firstName })}</Text>
          <Text variant="caption" color={colors.textSubtle}>
            {note} · {debt.currency}
          </Text>
        </View>
        <Button
          label={t('Pay')}
          size="sm"
          fullWidth={false}
          onPress={onPay}
          accessibilityHint={`Record a payment to ${to.firstName}`}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  oweCard: {
    padding: 18,
    borderRadius: radii.cardXl,
    backgroundColor: colors.negativeSoft,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  alertIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: { padding: 16, borderRadius: radii.cardXl, backgroundColor: colors.bg, gap: 14 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 },
  dash: { width: 22, borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: colors.chevron },
  coin: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  owedRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
