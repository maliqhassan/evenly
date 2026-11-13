import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { errorMessage } from '@/api';
import {
  AmountText,
  Avatar,
  Button,
  Card,
  Chip,
  EmptyState,
  Header,
  Icon,
  Overline,
  Pill,
  Screen,
  SelectSheet,
  SkeletonRows,
  Text,
  toast,
} from '@/components';
import { groupTransfers, indexBalances } from '@/domain/ledger';
import { usePeople } from '@/features/people';
import { t } from '@/i18n';
import { track } from '@/lib/monitoring';
import { useBalances, useGroup, useSendReminder } from '@/queries';
import { colors, radii } from '@/theme';

/** 18 — Balances: diverging net bars + simplified "who owes whom". */
export default function Balances() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { group } = useGroup(id);
  const balances = useBalances();
  const people = usePeople();
  const remind = useSendReminder();
  const [currencyPick, setCurrencyPick] = useState<string | null>(null);
  const [remindOpen, setRemindOpen] = useState(false);

  const byCurrency = useMemo(
    () => indexBalances((balances.data ?? []).filter((b) => b.groupId === id)).get(id),
    [balances.data, id],
  );
  const currencies = byCurrency ? [...byCurrency.keys()] : [];
  const currency =
    currencyPick ??
    (group && currencies.includes(group.currency) ? group.currency : (currencies[0] ?? group?.currency ?? 'USD'));
  const nets = byCurrency?.get(currency) ?? new Map<string, number>();
  const transfers = useMemo(
    () => groupTransfers(balances.data ?? [], id).find((t) => t.currency === currency)?.transfers ?? [],
    [balances.data, id, currency],
  );

  const rows = [...nets.entries()].map(([pid, net]) => ({ pid, net })).sort((a, b) => b.net - a.net);
  const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.net)));
  const owedToMe = transfers.filter((t) => t.to === people.myId);
  const iOwe = transfers.filter((t) => t.from === people.myId);

  const sendReminder = async (pid: string) => {
    try {
      await remind.mutateAsync({ groupId: id, profileId: pid });
      track('reminder_sent');
      toast.success(`Reminder sent to ${people.get(pid).firstName}`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Screen
      footer={
        <View style={styles.footer}>
          <Button
            label={t('Remind')}
            icon="bell-ring"
            variant="secondary"
            style={{ flex: 1 }}
            disabled={!owedToMe.length}
            onPress={() => (owedToMe.length === 1 ? sendReminder(owedToMe[0]!.from) : setRemindOpen(true))}
          />
          <Button
            label={t('Settle up')}
            style={{ flex: 1.4 }}
            onPress={() => router.push({ pathname: '/settle', params: { groupId: id } })}
          />
        </View>
      }
    >
      <Header title={t('Balances')} subtitle={group ? `${group.name} · ${currency}` : undefined} />

      {currencies.length > 1 ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {currencies.map((c) => (
            <Chip key={c} label={c} selected={c === currency} onPress={() => setCurrencyPick(c)} />
          ))}
        </View>
      ) : null}

      {balances.isLoading ? (
        <SkeletonRows count={4} />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon="circle-check"
            title={t('Everyone is settled up')}
            body={t('New expenses will show up here.')}
          />
        </Card>
      ) : (
        <>
          <Card padded style={{ gap: 14 }}>
            <Overline>{t('NET BALANCES')}</Overline>
            {rows.map((r) => {
              const p = people.get(r.pid);
              const pct = Math.abs(r.net) / maxAbs;
              return (
                <View
                  key={r.pid}
                  style={styles.netRow}
                  accessibilityLabel={`${people.label(r.pid)} ${r.net > 0 ? 'gets back' : 'owes'}`}
                >
                  <Avatar id={r.pid} name={p.name} uri={p.avatarUrl} size={32} />
                  <Text variant="secondaryMedium" style={{ width: 56 }} numberOfLines={1}>
                    {people.label(r.pid)}
                  </Text>
                  <View style={styles.bars}>
                    <View style={[styles.half, styles.leftHalf]}>
                      {r.net < 0 ? <View style={[styles.bar, styles.barNeg, { width: `${pct * 100}%` }]} /> : null}
                    </View>
                    <View style={styles.half}>
                      {r.net > 0 ? <View style={[styles.bar, styles.barPos, { width: `${pct * 100}%` }]} /> : null}
                    </View>
                  </View>
                  <AmountText
                    minor={r.net}
                    currency={currency}
                    sign="always"
                    tone="auto"
                    variant="secondaryStrong"
                    style={{ width: 82, textAlign: 'right' }}
                  />
                </View>
              );
            })}
          </Card>

          <View style={{ gap: 8 }}>
            <View style={styles.titleRow}>
              <Text variant="section">{t('Who owes whom')}</Text>
              <Pill label={t('Simplified')} tone="positive" variant="soft" />
            </View>
            {transfers.map((t) => {
              const from = people.get(t.from);
              const to = people.get(t.to);
              const mine = t.to === people.myId ? 'in' : t.from === people.myId ? 'out' : 'other';
              const text =
                mine === 'in'
                  ? `${from.firstName} owes you`
                  : mine === 'out'
                    ? `You owe ${to.firstName}`
                    : `${from.firstName} owes ${to.firstName}`;
              return (
                <Card key={`${t.from}-${t.to}`} radius={radii.card} style={styles.owe}>
                  <Avatar id={t.from} name={from.name} uri={from.avatarUrl} size={34} />
                  <Icon name="arrow-right" size={16} color={colors.textFaint} />
                  <Avatar id={t.to} name={to.name} uri={to.avatarUrl} size={34} />
                  <Text
                    variant="secondary"
                    color={colors.textMuted}
                    style={{ flex: 1, paddingLeft: 4 }}
                    numberOfLines={1}
                  >
                    {text}
                  </Text>
                  <AmountText
                    minor={t.amount}
                    currency={currency}
                    tone={mine === 'in' ? 'positive' : mine === 'out' ? 'negative' : 'neutral'}
                    variant="bodyLgStrong"
                  />
                </Card>
              );
            })}
            {iOwe.length === 0 && owedToMe.length === 0 ? (
              <Text variant="secondary" color={colors.textMuted}>
                You’re settled up with everyone in {currency}.
              </Text>
            ) : null}
          </View>
        </>
      )}

      <SelectSheet
        visible={remindOpen}
        onClose={() => setRemindOpen(false)}
        title={t('Send a reminder')}
        options={owedToMe.map((t) => ({
          value: t.from,
          label: people.get(t.from).name,
          description: 'Sends a gentle push reminder',
        }))}
        onSelect={sendReminder}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  footer: { flexDirection: 'row', gap: 10 },
  netRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bars: { flex: 1, flexDirection: 'row', height: 10 },
  half: { flex: 1, flexDirection: 'row' },
  leftHalf: { justifyContent: 'flex-end', borderRightWidth: 1, borderRightColor: colors.borderStrong },
  bar: { height: 10 },
  barNeg: { backgroundColor: colors.barNegative, borderTopLeftRadius: 5, borderBottomLeftRadius: 5 },
  barPos: { backgroundColor: colors.barPositive, borderTopRightRadius: 5, borderBottomRightRadius: 5 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  owe: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, paddingHorizontal: 16 },
});
