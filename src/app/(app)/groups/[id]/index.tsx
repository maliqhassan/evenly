import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Expense, Settlement } from '@/api';
import {
  AmountText,
  Avatar,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Icon,
  IconButton,
  IconTile,
  Pill,
  Pressable,
  RadialFill,
  SkeletonRows,
  Text,
  UnderlineTabs,
} from '@/components';
import { expenseImpact, myGroupNets } from '@/domain/ledger';
import { formatMoney } from '@/domain/money';
import { categoryIcon } from '@/features/expenses/categories';
import { activeMembers, usePeople } from '@/features/people';
import { usePreferences } from '@/hooks/usePreferences';
import { t } from '@/i18n';
import { dayOfMonth, monthHeader, monthShort, sinceLabel } from '@/lib/dates';
import { useBalances, useGroup, useGroupExpenses, useGroupSettlements, useGroupTotals } from '@/queries';
import { useExpenseDraft } from '@/stores/drafts';
import { useSession } from '@/stores/session';
import { colors, radii, shadows, spacing } from '@/theme';

type Tab = 'expenses' | 'members' | 'totals';
type Entry =
  | { kind: 'expense'; date: string; at: string; e: Expense }
  | { kind: 'settlement'; date: string; at: string; s: Settlement };

/** 14 — Group details */
export default function GroupDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const myId = useSession((s) => s.me!.profile.id);
  const { group, isLoading } = useGroup(id);
  const balances = useBalances();
  const expenses = useGroupExpenses(id);
  const settlements = useGroupSettlements(id);
  const [tab, setTab] = useState<Tab>('expenses');

  const nets = myGroupNets(balances.data ?? [], id, myId);
  const primary = nets.find((n) => n.currency === group?.currency) ?? nets[0];

  const entries = useMemo<Entry[]>(() => {
    const list: Entry[] = [
      ...(expenses.data ?? []).map((e) => ({ kind: 'expense' as const, date: e.date, at: e.createdAt, e })),
      ...(settlements.data ?? [])
        .filter((s) => s.status !== 'rejected')
        .map((s) => ({ kind: 'settlement' as const, date: s.date, at: s.createdAt, s })),
    ];
    return list.sort((a, b) => b.date.localeCompare(a.date) || b.at.localeCompare(a.at));
  }, [expenses.data, settlements.data]);

  if (!group) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 20, paddingHorizontal: 20 }]}>
        {isLoading ? (
          <SkeletonRows count={5} />
        ) : (
          <ErrorState message={t('This group isn’t available.')} onRetry={() => router.back()} />
        )}
      </View>
    );
  }

  const members = activeMembers(group);
  const addExpense = () => {
    useExpenseDraft.getState().start({ group, me: myId });
    router.push({ pathname: '/add-expense', params: { keepDraft: '1' } });
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 120 }} showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, { paddingTop: insets.top + 14 }]}>
          <View style={styles.heroNav}>
            <IconButton icon="arrow-left" tone="onDark" label={t('Back')} onPress={() => router.back()} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <IconButton
                icon="user-plus"
                tone="onDark"
                label={t('Invite members')}
                onPress={() => router.push({ pathname: '/groups/[id]/invite', params: { id } })}
              />
              <IconButton
                icon="settings"
                tone="onDark"
                label={t('Group settings')}
                onPress={() => router.push({ pathname: '/groups/[id]/settings', params: { id } })}
              />
            </View>
          </View>
          <View style={styles.identity}>
            <IconTile icon={group.icon} size={56} radius={18} bg={colors.mint} fg={colors.forest} iconSize={25} />
            <View style={{ gap: 4, flex: 1 }}>
              <Text variant="h3" color={colors.onDark} numberOfLines={1} accessibilityRole="header">
                {group.name}
              </Text>
              <Text variant="secondary" color={colors.onDarkMuted}>
                {members.length} members · {group.currency} · {sinceLabel(group.createdAt)}
              </Text>
            </View>
          </View>
          {group.archivedAt ? (
            <View style={styles.archived}>
              <Icon name="archive" size={16} color={colors.onDarkMuted} />
              <Text variant="secondary" color={colors.onDarkMuted}>
                {t('Archived — restore it in settings to add expenses.')}
              </Text>
            </View>
          ) : null}
          <View style={styles.owedCard}>
            <RadialFill colors={colors.mintGradientSoft} cy="0%" rx="120%" ry="120%" />
            <View style={{ gap: 2, flex: 1 }}>
              <Text variant="caption" color={colors.textMuted}>
                {primary ? (primary.net > 0 ? 'You are owed' : 'You owe') : 'All settled'}
              </Text>
              {primary ? (
                <AmountText
                  minor={Math.abs(primary.net)}
                  currency={primary.currency}
                  tone={primary.net > 0 ? 'positive' : 'negative'}
                  variant="h3"
                />
              ) : (
                <Text variant="h3" color={colors.textSubtle}>
                  {t('Settled up')}
                </Text>
              )}
              {nets.length > 1 ? (
                <Text variant="micro" color={colors.textMuted}>
                  {t('+ other currencies')}
                </Text>
              ) : null}
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button
                label={t('Balances')}
                size="sm"
                variant="secondary"
                fullWidth={false}
                style={{ height: 38 }}
                onPress={() => router.push({ pathname: '/groups/[id]/balances', params: { id } })}
              />
              <Button
                label={t('Settle up')}
                size="sm"
                fullWidth={false}
                style={{ height: 38 }}
                onPress={() => router.push({ pathname: '/settle', params: { groupId: id } })}
              />
            </View>
          </View>
        </View>

        <View style={{ paddingHorizontal: spacing.screen, paddingTop: 16, gap: 6 }}>
          <UnderlineTabs
            value={tab}
            onChange={setTab}
            options={[
              { value: 'expenses', label: t('Expenses') },
              { value: 'members', label: t('Members') },
              { value: 'totals', label: t('Totals') },
            ]}
          />
          {tab === 'expenses' ? (
            <ExpensesTab
              entries={entries}
              loading={expenses.isLoading}
              myId={myId}
              onAdd={addExpense}
              canAdd={!group.archivedAt}
            />
          ) : tab === 'members' ? (
            <MembersTab groupId={id} />
          ) : (
            <TotalsTab groupId={id} />
          )}
        </View>
      </ScrollView>

      {!group.archivedAt ? (
        <Pressable
          onPress={addExpense}
          haptic
          accessibilityLabel="Add expense"
          style={[styles.fab, shadows.fab, { bottom: insets.bottom + 24 }]}
        >
          <Icon name="plus" size={20} color={colors.onDarkStrong} />
          <Text variant="bodyLgMedium" color={colors.onDarkStrong}>
            {t('Add expense')}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ExpensesTab({
  entries,
  loading,
  myId,
  onAdd,
  canAdd,
}: {
  entries: Entry[];
  loading: boolean;
  myId: string;
  onAdd: () => void;
  canAdd: boolean;
}) {
  const people = usePeople();
  if (loading) return <SkeletonRows count={5} bg={colors.surface} />;
  if (!entries.length)
    return (
      <EmptyState
        icon="receipt"
        title={t('No expenses yet')}
        body={t('Add the first shared cost for this group.')}
        action={canAdd ? 'Add expense' : undefined}
        onAction={onAdd}
      />
    );
  return (
    <View>
      {entries.map((x, i) => {
        const head = monthHeader(x.date);
        const prev = entries[i - 1];
        const showHead = !prev || monthHeader(prev.date) !== head;
        return (
          <View key={x.kind === 'expense' ? x.e.id : x.s.id}>
            {showHead ? (
              <Text variant="overline" color={colors.textFaint} style={{ paddingTop: 10, paddingBottom: 2 }}>
                {head}
              </Text>
            ) : null}
            {x.kind === 'expense' ? (
              <ExpenseRow e={x.e} myId={myId} payer={people.label(x.e.paidBy)} />
            ) : (
              <SettlementRow
                s={x.s}
                label={`${people.label(x.s.from)} paid ${people.label(x.s.to) === 'You' ? 'you' : people.label(x.s.to)}`}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

function DateBlock({ date }: { date: string }) {
  return (
    <View style={styles.dateBlock}>
      <Text variant="micro" color={colors.textFaint}>
        {monthShort(date).toUpperCase()}
      </Text>
      <Text variant="nav" tabular>
        {dayOfMonth(date)}
      </Text>
    </View>
  );
}

function ExpenseRow({ e, myId, payer }: { e: Expense; myId: string; payer: string }) {
  const { locale } = usePreferences();
  const impact = expenseImpact(e, myId);
  const color = impact.kind === 'lent' ? colors.positive : impact.kind === 'owe' ? colors.negative : colors.textSubtle;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/expense/[id]', params: { id: e.id } })}
      scaleOnPress={false}
      accessibilityLabel={`${e.description}, ${payer} paid`}
      style={styles.row}
    >
      <DateBlock date={e.date} />
      <IconTile icon={categoryIcon(e.categoryId)} size={38} radius={12} iconSize={17} />
      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {e.description}
        </Text>
        <Text variant="caption" color={colors.textSubtle} numberOfLines={1}>
          {payer} paid {formatMoney(e.amount, e.currency, { locale })}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <Text variant="micro" color={color}>
          {impact.kind === 'lent' ? 'you lent' : impact.kind === 'owe' ? 'you owe' : 'not involved'}
        </Text>
        {impact.kind !== 'none' ? <AmountText minor={impact.amount} currency={e.currency} color={color} /> : null}
      </View>
    </Pressable>
  );
}

function SettlementRow({ s, label }: { s: Settlement; label: string }) {
  return (
    <View style={styles.row} accessibilityLabel={`${label}, settlement`}>
      <DateBlock date={s.date} />
      <IconTile icon="circle-check" size={38} radius={12} iconSize={17} bg={colors.positiveSoft} fg={colors.positive} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {label}
        </Text>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          <Text variant="caption" color={colors.textSubtle}>
            {t('Settlement')}
          </Text>
          {s.status === 'pending' ? <Pill label={t('Pending')} tone="warning" /> : null}
        </View>
      </View>
      <AmountText minor={s.amount} currency={s.currency} tone="muted" />
    </View>
  );
}

function MembersTab({ groupId }: { groupId: string }) {
  const myId = useSession((s) => s.me!.profile.id);
  const { group } = useGroup(groupId);
  const balances = useBalances();
  if (!group) return null;
  return (
    <View>
      {activeMembers(group).map((m) => {
        const nets = (balances.data ?? []).filter((b) => b.groupId === groupId && b.profileId === m.profileId);
        const n = nets.find((x) => x.currency === group.currency) ?? nets[0];
        return (
          <View key={m.profileId} style={styles.memberRow}>
            <Avatar id={m.profileId} name={m.name} uri={m.avatarUrl} size={40} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyStrong">{m.profileId === myId ? `${m.name} (you)` : m.name}</Text>
              <Text variant="caption" color={colors.textSubtle}>
                {m.role === 'owner' ? 'Owner' : m.role === 'admin' ? 'Admin' : 'Member'}
              </Text>
            </View>
            {n ? (
              <View style={{ alignItems: 'flex-end' }}>
                <Text variant="micro" color={n.net > 0 ? colors.positive : colors.negative}>
                  {n.net > 0 ? 'gets back' : 'owes'}
                </Text>
                <AmountText minor={Math.abs(n.net)} currency={n.currency} tone={n.net > 0 ? 'positive' : 'negative'} />
              </View>
            ) : (
              <Text variant="secondary" color={colors.textSubtle}>
                {t('Settled up')}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

function TotalsTab({ groupId }: { groupId: string }) {
  const totals = useGroupTotals(groupId);
  if (totals.isLoading) return <SkeletonRows count={3} bg={colors.surface} />;
  if (!totals.data?.length)
    return (
      <EmptyState
        icon="chart-pie"
        title={t('No spending yet')}
        body={t('Totals appear once the group has expenses.')}
      />
    );
  return (
    <View style={{ gap: 12, paddingTop: 10 }}>
      {totals.data.map((tot) => (
        <Card key={tot.currency} tone="bg" padded radius={radii.card} style={{ gap: 12 }}>
          <Text variant="overline" color={colors.textFaint}>
            {tot.currency} · {tot.count} {tot.count === 1 ? 'expense' : 'expenses'}
          </Text>
          <TotalLine label={t('Total group spending')} minor={tot.totalSpent} currency={tot.currency} strong />
          <TotalLine label={t('You paid')} minor={tot.myPaid} currency={tot.currency} />
          <TotalLine label={t('Your share')} minor={tot.myShare} currency={tot.currency} />
        </Card>
      ))}
    </View>
  );
}

function TotalLine({
  label,
  minor,
  currency,
  strong,
}: {
  label: string;
  minor: number;
  currency: string;
  strong?: boolean;
}) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text variant="body" color={colors.textMuted}>
        {label}
      </Text>
      <AmountText minor={minor} currency={currency} variant={strong ? 'section' : 'bodyStrong'} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  hero: { backgroundColor: colors.forestCard, paddingHorizontal: spacing.screen, paddingBottom: 22, gap: 18 },
  heroNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  archived: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  owedCard: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radii.card,
    overflow: 'hidden',
    backgroundColor: colors.mint,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, minHeight: 56 },
  dateBlock: { width: 40, alignItems: 'center' },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  fab: {
    position: 'absolute',
    right: 22,
    height: 56,
    paddingLeft: 18,
    paddingRight: 22,
    borderRadius: 28,
    backgroundColor: colors.forest,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
