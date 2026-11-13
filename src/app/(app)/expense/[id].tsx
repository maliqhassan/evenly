import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';

import { errorMessage, type AuditEntry, type Group } from '@/api';
import {
  alert,
  AmountText,
  Avatar,
  Card,
  ErrorState,
  Header,
  IconButton,
  IconTile,
  Overline,
  Pressable,
  Screen,
  SkeletonRows,
  Text,
  toast,
} from '@/components';
import { formatMoney, type CurrencyCode } from '@/domain/money';
import { categoryIcon } from '@/features/expenses/categories';
import { usePeople } from '@/features/people';
import { usePreferences } from '@/hooks/usePreferences';
import { t } from '@/i18n';
import { formatDate, formatTimestamp } from '@/lib/dates';
import { track } from '@/lib/monitoring';
import { useDeleteExpense, useExpense, useGroup } from '@/queries';
import { colors } from '@/theme';

/** 17 — Expense details */
export default function ExpenseDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useExpense(id);
  const { group } = useGroup(q.data?.groupId);
  const people = usePeople();
  const { dateFormat } = usePreferences();
  const del = useDeleteExpense();
  const [showAll, setShowAll] = useState(false);
  const [viewer, setViewer] = useState<string | null>(null);

  const e = q.data;
  if (!e) {
    return (
      <Screen>
        <Header />
        {q.isLoading ? (
          <SkeletonRows count={4} />
        ) : (
          <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
        )}
      </Screen>
    );
  }

  const myId = people.myId;
  const myRole = group?.members.find((m) => m.profileId === myId)?.role;
  const canEdit =
    !group?.archivedAt && (e.createdBy === myId || e.paidBy === myId || myRole === 'owner' || myRole === 'admin');
  const payer = people.get(e.paidBy);
  const creator = people.label(e.createdBy);

  const confirmDelete = () =>
    alert('Delete this expense?', 'It will be removed from balances. The change is recorded in the history.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await del.mutateAsync({ id: e.id, groupId: e.groupId });
            track('expense_deleted');
            toast.success(t('Expense deleted'));
            router.back();
          } catch (err) {
            toast.error(errorMessage(err));
          }
        },
      },
    ]);

  const shares = [...e.splits].sort((a, b) =>
    a.profileId === myId
      ? -1
      : b.profileId === myId
        ? 1
        : a.profileId === e.paidBy
          ? 1
          : b.profileId === e.paidBy
            ? -1
            : 0,
  );
  const history = showAll ? e.audit : e.audit.slice(0, 1);

  return (
    <Screen gap={16} refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <Header
        right={
          canEdit ? (
            <>
              <IconButton
                icon="pencil"
                iconSize={19}
                label={t('Edit expense')}
                onPress={() => router.push({ pathname: '/add-expense', params: { expenseId: e.id } })}
              />
              <IconButton
                icon="trash-2"
                iconSize={19}
                label={t('Delete expense')}
                color={colors.negative}
                onPress={confirmDelete}
              />
            </>
          ) : undefined
        }
      />

      <View style={styles.hero}>
        <IconTile
          icon={categoryIcon(e.categoryId)}
          size={56}
          radius={18}
          bg={colors.positiveSoft}
          fg={colors.positive}
          iconSize={25}
        />
        <Text variant="nav" align="center" style={{ marginTop: 6 }}>
          {e.description}
        </Text>
        <AmountText minor={e.amount} currency={e.currency} variant="hero" />
        <Text variant="caption" color={colors.textSubtle} align="center">
          {group?.name ?? 'Group'} · {formatDate(e.date, dateFormat)} · Added by {creator}
        </Text>
      </View>

      <Card style={{ paddingVertical: 6, paddingHorizontal: 16 }}>
        <View style={[styles.payerRow, styles.divider]}>
          <Avatar id={e.paidBy} name={payer.name} uri={payer.avatarUrl} size={36} />
          <Text variant="body" style={{ flex: 1 }}>
            <Text variant="bodyStrong">{people.label(e.paidBy)}</Text> paid
          </Text>
          <AmountText minor={e.amount} currency={e.currency} variant="bodyLgStrong" />
        </View>
        {shares.map((s) => {
          const p = people.get(s.profileId);
          const isPayer = s.profileId === e.paidBy;
          const text = isPayer
            ? s.profileId === myId
              ? 'Your own share'
              : `${payer.firstName}’s own share`
            : s.profileId === myId
              ? `You owe ${payer.firstName}`
              : `${p.firstName} owes ${e.paidBy === myId ? 'you' : payer.firstName}`;
          const color = isPayer
            ? colors.textSubtle
            : s.profileId === myId
              ? colors.negative
              : e.paidBy === myId
                ? colors.positive
                : colors.ink;
          return (
            <View key={s.profileId} style={styles.shareRow}>
              <Avatar id={s.profileId} name={p.name} uri={p.avatarUrl} size={30} style={{ marginLeft: 3 }} />
              <Text variant="secondary" color={colors.textMuted} style={{ flex: 1 }}>
                {text}
              </Text>
              <AmountText minor={s.amount} currency={e.currency} color={color} variant="secondaryStrong" />
            </View>
          );
        })}
      </Card>

      {e.itemization ? (
        <View style={{ gap: 8 }}>
          <Overline>{t('ITEMS')}</Overline>
          <Card style={{ paddingVertical: 6, paddingHorizontal: 16 }}>
            {e.itemization.items.map((it, i) => (
              <View key={i} style={[styles.shareRow, { alignItems: 'flex-start' }]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="bodyMedium">{it.name}</Text>
                  <Text variant="caption" color={colors.textSubtle}>
                    {it.memberIds.length === 1
                      ? `${people.label(it.memberIds[0]!)} only`
                      : `Shared by ${it.memberIds.map((m) => people.label(m)).join(', ')}`}
                  </Text>
                </View>
                <AmountText minor={it.amount} currency={e.currency} variant="secondaryStrong" />
              </View>
            ))}
            {e.itemization.extra > 0 ? (
              <View style={styles.shareRow}>
                <Text variant="secondary" color={colors.textMuted} style={{ flex: 1 }}>
                  {t('Tax & tip, shared in proportion')}
                </Text>
                <AmountText minor={e.itemization.extra} currency={e.currency} variant="secondaryStrong" />
              </View>
            ) : null}
          </Card>
        </View>
      ) : null}

      {e.notes ? (
        <Card padded style={{ gap: 4 }}>
          <Text variant="caption" color={colors.textFaint}>
            {t('Note')}
          </Text>
          <Text variant="body">{e.notes}</Text>
        </Card>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 10 }}>
        {e.receipts[0]?.url ? (
          <Pressable
            onPress={() => setViewer(e.receipts[0]!.url)}
            accessibilityLabel="View receipt"
            style={styles.receipt}
          >
            <Image source={{ uri: e.receipts[0].url }} style={StyleSheet.absoluteFill} contentFit="cover" />
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => setShowAll((v) => !v)}
          disabled={e.audit.length <= 1}
          scaleOnPress={false}
          accessibilityLabel="Expense history"
          style={styles.history}
        >
          <Text variant="caption" color={colors.textFaint}>
            History{e.audit.length > 1 ? ` · ${e.audit.length} changes` : ''}
          </Text>
          {history.map((a) => (
            <View key={a.id} style={{ gap: 2 }}>
              <AuditLine entry={a} label={people.label(a.actorId)} currency={e.currency} group={group} />
              <Text variant="micro" color={colors.textFaint}>
                {formatTimestamp(a.createdAt)}
              </Text>
            </View>
          ))}
          {e.audit.length > 1 && !showAll ? (
            <Text variant="captionMedium" color={colors.positive}>
              {t('Show all')}
            </Text>
          ) : null}
        </Pressable>
      </View>

      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <Pressable
          style={styles.viewer}
          onPress={() => setViewer(null)}
          accessibilityLabel="Close receipt"
          scaleOnPress={false}
        >
          {viewer ? (
            <Image source={{ uri: viewer }} style={{ width: '100%', height: '80%' }} contentFit="contain" />
          ) : null}
        </Pressable>
      </Modal>
    </Screen>
  );
}

function AuditLine({
  entry,
  label,
  currency,
}: {
  entry: AuditEntry;
  label: string;
  currency: CurrencyCode;
  group?: Group;
}) {
  const { locale } = usePreferences();
  const fmt = (v: unknown) => formatMoney(Number(v), currency, { locale });
  const b = entry.before ?? {};
  const a = entry.after ?? {};
  if (entry.action === 'create') {
    return <Text variant="caption">{label} added this expense</Text>;
  }
  if (entry.action === 'delete') {
    return <Text variant="caption">{label} deleted this expense</Text>;
  }
  if (
    b.amount_minor !== undefined &&
    a.amount_minor !== undefined &&
    Number(b.amount_minor) !== Number(a.amount_minor)
  ) {
    return (
      <Text variant="caption">
        {label} changed amount{' '}
        <Text variant="caption" color={colors.textFaint} style={{ textDecorationLine: 'line-through' }}>
          {fmt(b.amount_minor)}
        </Text>{' '}
        → {fmt(a.amount_minor)}
      </Text>
    );
  }
  if (b.description !== a.description && a.description) {
    return (
      <Text variant="caption">
        {label} renamed it to “{String(a.description)}”
      </Text>
    );
  }
  if (JSON.stringify(b.splits) !== JSON.stringify(a.splits))
    return <Text variant="caption">{label} changed the split</Text>;
  if (b.paid_by !== a.paid_by) return <Text variant="caption">{label} changed who paid</Text>;
  return <Text variant="caption">{label} edited this expense</Text>;
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: 6 },
  payerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  shareRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  receipt: { width: 96, height: 96, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.surfaceMuted2 },
  history: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 6,
  },
  viewer: {
    flex: 1,
    backgroundColor: colors.viewerBackdrop,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
});
