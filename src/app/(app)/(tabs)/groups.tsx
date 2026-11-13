import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  AvatarStack,
  Button,
  EmptyState,
  ErrorState,
  Icon,
  IconTile,
  Pressable,
  Screen,
  Segmented,
  SkeletonRows,
  Text,
} from '@/components';
import { myGroupNets } from '@/domain/ledger';
import { GroupBalanceLabel } from '@/features/groups/GroupBalanceLabel';
import { activeMembers } from '@/features/people';
import { t } from '@/i18n';
import { useBalances, useGroups } from '@/queries';
import { useSession } from '@/stores/session';
import { colors, radii } from '@/theme';

/** 11 — Groups */
export default function Groups() {
  const myId = useSession((s) => s.me!.profile.id);
  const groups = useGroups();
  const balances = useBalances();
  const [tab, setTab] = useState<'active' | 'archived'>('active');

  const all = groups.data ?? [];
  const active = all.filter((g) => !g.archivedAt);
  const archived = all.filter((g) => g.archivedAt);
  const list = tab === 'active' ? active : archived;

  return (
    <Screen
      withTabBar
      refreshing={groups.isRefetching}
      onRefresh={() => {
        void groups.refetch();
        void balances.refetch();
      }}
    >
      <View style={styles.header}>
        <Text variant="h1" accessibilityRole="header">
          {t('Groups')}
        </Text>
        <Button
          label={t('New')}
          icon="plus"
          size="md"
          onPress={() => router.push('/new-group')}
          accessibilityHint="Create a new group"
          style={{ paddingLeft: 12 }}
        />
      </View>

      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'active', label: `${t('Active')} · ${active.length}` },
          { value: 'archived', label: `${t('Archived')} · ${archived.length}` },
        ]}
      />

      {groups.isLoading ? (
        <SkeletonRows count={4} />
      ) : groups.isError ? (
        <ErrorState onRetry={() => groups.refetch()} />
      ) : list.length === 0 ? (
        tab === 'active' ? (
          <EmptyState
            icon="users"
            title={t('No groups yet')}
            body={t('Create a group for your home, a trip, or anyone you share costs with.')}
            action={t('Create group')}
            onAction={() => router.push('/new-group')}
          />
        ) : (
          <EmptyState
            icon="archive"
            title={t('Nothing archived')}
            body={t('Archived groups keep their history but leave your active list.')}
          />
        )
      ) : (
        list.map((g) => {
          const members = activeMembers(g);
          return (
            <Pressable
              key={g.id}
              onPress={() => router.push({ pathname: '/groups/[id]', params: { id: g.id } })}
              accessibilityLabel={`${g.name}, ${members.length} members`}
              style={styles.card}
            >
              <View style={styles.top}>
                <IconTile icon={g.icon} size={46} radius={14} bg={colors.forestCard} fg={colors.mint} iconSize={20} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="section" numberOfLines={1}>
                    {g.name}
                  </Text>
                  <Text variant="caption" color={colors.textSubtle}>
                    {members.length} {members.length === 1 ? 'member' : 'members'} · {g.currency}
                  </Text>
                </View>
                <Icon name="chevron-right" size={18} color={colors.textFaint} />
              </View>
              <View style={styles.bottom}>
                <AvatarStack
                  people={members.map((m) => ({ id: m.profileId, name: m.name, uri: m.avatarUrl }))}
                  size={24}
                  ring={colors.surface}
                />
                <GroupBalanceLabel nets={myGroupNets(balances.data ?? [], g.id, myId)} />
              </View>
            </Pressable>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  card: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radii.cardXl,
    backgroundColor: colors.surface,
    gap: 12,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
});
