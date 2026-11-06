import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  AmountText,
  Avatar,
  EmptyState,
  IconButton,
  Pressable,
  Screen,
  SelectSheet,
  SkeletonRows,
  Text,
} from '@/components';
import { dashboardSummary, friendBalances } from '@/domain/ledger';
import { formatMoney } from '@/domain/money';
import { usePreferences } from '@/hooks/usePreferences';
import { useBalances, useFriends, useGroups } from '@/queries';
import { useSession } from '@/stores/session';
import { colors, radii } from '@/theme';

/** 10 — Friends: everyone you share a group with, and where you stand with each. */
export default function Friends() {
  const myId = useSession((s) => s.me!.profile.id);
  const { currency: preferred, locale } = usePreferences();
  const friends = useFriends();
  const balances = useBalances();
  const groups = useGroups();
  const [pickGroup, setPickGroup] = useState(false);

  const summary = useMemo(
    () => dashboardSummary(balances.data ?? [], myId, preferred)[0]!,
    [balances.data, myId, preferred],
  );
  const byFriend = useMemo(() => friendBalances(balances.data ?? [], myId), [balances.data, myId]);

  const rows = useMemo(() => {
    const list = (friends.data ?? []).map((f) => {
      const b = byFriend.get(f.profileId)?.byCurrency ?? [];
      const primary = b.find((x) => x.currency === preferred) ?? b[0] ?? null;
      return { f, b, primary };
    });
    // Owed to you first (largest first), then you owe, then settled.
    const rank = (x: (typeof list)[number]) => (x.primary ? (x.primary.net > 0 ? 0 : 1) : 2);
    return list.sort(
      (a, b) =>
        rank(a) - rank(b) ||
        Math.abs(b.primary?.net ?? 0) - Math.abs(a.primary?.net ?? 0) ||
        a.f.name.localeCompare(b.f.name),
    );
  }, [friends.data, byFriend, preferred]);

  const groupsLabel = (names: string[]) =>
    names.length <= 2 ? names.join(' · ') : `${names[0]} · ${names.length - 1} more`;

  return (
    <Screen
      bg={colors.surface}
      withTabBar
      refreshing={friends.isRefetching}
      onRefresh={() => {
        void friends.refetch();
        void balances.refetch();
      }}
    >
      <View style={styles.header}>
        <Text variant="h1" accessibilityRole="header">
          Friends
        </Text>
        <IconButton icon="user-plus" tone="muted" label="Add a friend to a group" onPress={() => setPickGroup(true)} />
      </View>

      <View style={styles.tiles}>
        <View style={[styles.tile, { backgroundColor: colors.positiveSoft }]}>
          <Text variant="caption" color={colors.forest}>
            Owed to you
          </Text>
          <AmountText
            minor={summary.owedToYou}
            currency={summary.currency}
            tone="positive"
            variant="h3"
            style={{ fontSize: 20 }}
          />
        </View>
        <View style={[styles.tile, { backgroundColor: colors.negativeSoft }]}>
          <Text variant="caption" color={colors.forest}>
            You owe
          </Text>
          <AmountText
            minor={summary.youOwe}
            currency={summary.currency}
            tone="negative"
            variant="h3"
            style={{ fontSize: 20 }}
          />
        </View>
      </View>

      {friends.isLoading ? (
        <SkeletonRows count={6} bg={colors.surface} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="users"
          title="No friends yet"
          body="People you share a group with appear here."
          action="Invite someone"
          onAction={() => setPickGroup(true)}
        />
      ) : (
        <View>
          {rows.map(({ f, b, primary }) => {
            const tone = primary ? (primary.net > 0 ? colors.positive : colors.negative) : colors.textSubtle;
            const extra = b.filter((x) => x !== primary);
            return (
              <Pressable
                key={f.profileId}
                onPress={() =>
                  f.groupIds[0] && router.push({ pathname: '/groups/[id]', params: { id: f.groupIds[0] } })
                }
                scaleOnPress={false}
                accessibilityLabel={`${f.name}${primary ? (primary.net > 0 ? ', owes you ' : ', you owe ') + formatMoney(Math.abs(primary.net), primary.currency, { locale }) : ', settled up'}`}
                style={styles.row}
              >
                <Avatar id={f.profileId} name={f.name} uri={f.avatarUrl} size={44} />
                <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                  <Text variant="bodyLgStrong" numberOfLines={1}>
                    {f.name}
                  </Text>
                  <Text variant="caption" color={colors.textSubtle} numberOfLines={1}>
                    {groupsLabel(f.groupNames)}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  {primary ? (
                    <>
                      <Text variant="micro" color={tone}>
                        {primary.net > 0 ? 'owes you' : 'you owe'}
                      </Text>
                      <AmountText
                        minor={Math.abs(primary.net)}
                        currency={primary.currency}
                        color={tone}
                        variant="bodyLgStrong"
                      />
                      {extra.length ? (
                        <Text variant="micro" color={colors.textFaint}>
                          +{' '}
                          {extra
                            .map(
                              (x) => `${x.net > 0 ? '+' : '−'}${formatMoney(Math.abs(x.net), x.currency, { locale })}`,
                            )
                            .join(' ')}
                        </Text>
                      ) : null}
                    </>
                  ) : (
                    <Text variant="bodyLgStrong" color={colors.textSubtle}>
                      Settled up
                    </Text>
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      <SelectSheet
        visible={pickGroup}
        onClose={() => setPickGroup(false)}
        title="Invite to which group?"
        options={(groups.data ?? [])
          .filter((g) => !g.archivedAt)
          .map((g) => ({ value: g.id, label: g.name, icon: g.icon }))}
        onSelect={(id) => router.push({ pathname: '/groups/[id]/invite', params: { id } })}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tiles: { flexDirection: 'row', gap: 10 },
  tile: { flex: 1, paddingVertical: 14, paddingHorizontal: 16, borderRadius: radii.card, gap: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
});
