import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import type { ActivityItem, ActivityQuery } from '@/api';
import { Chip, EmptyState, ErrorState, IconButton, SearchField, SelectSheet, SkeletonRows, Text } from '@/components';
import { ActivityRow } from '@/features/activity/ActivityRow';
import { useDebounced } from '@/hooks/useDebounced';
import { t } from '@/i18n';
import { dayHeader, isoDateOf } from '@/lib/dates';
import { useActivity, useGroups } from '@/queries';
import { useSession } from '@/stores/session';
import { colors, sizes, spacing } from '@/theme';

const FILTERS: { value: NonNullable<ActivityQuery['kind']>; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'expenses', label: 'Expenses' },
  { value: 'settlements', label: 'Settlements' },
  { value: 'groups', label: 'Groups' },
];

type Row = { type: 'header'; key: string; label: string } | { type: 'item'; key: string; item: ActivityItem };

/** 09 — Activity (paginated, date-grouped, searchable). */
export default function Activity() {
  const insets = useSafeAreaInsets();
  const myId = useSession((s) => s.me!.profile.id);
  const [kind, setKind] = useState<NonNullable<ActivityQuery['kind']>>('all');
  const [search, setSearch] = useState('');
  const [groupId, setGroupId] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const debounced = useDebounced(search);
  const groups = useGroups();
  const q = useActivity({ kind, search: debounced || undefined, groupId: groupId ?? undefined });

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    let last = '';
    for (const page of q.data?.pages ?? []) {
      for (const item of page.items) {
        const h = dayHeader(isoDateOf(item.createdAt));
        if (h !== last) {
          out.push({ type: 'header', key: `h-${h}-${item.id}`, label: h });
          last = h;
        }
        out.push({ type: 'item', key: `i-${item.id}`, item });
      }
    }
    return out;
  }, [q.data]);

  const groupOptions = [
    { value: '__all', label: 'All groups' },
    ...(groups.data ?? []).map((g) => ({ value: g.id, label: g.name, icon: g.icon })),
  ];

  const header = (
    <View style={{ gap: 16, paddingBottom: 4 }}>
      <View style={styles.titleRow}>
        <Text variant="h1" accessibilityRole="header">
          {t('Activity')}
        </Text>
        <IconButton
          icon="sliders-horizontal"
          tone="plain"
          iconSize={22}
          label={t('Filter by group')}
          badge={!!groupId}
          onPress={() => setFilterOpen(true)}
        />
      </View>
      <SearchField value={search} onChangeText={setSearch} placeholder={t('Search expenses, people, groups')} />
      <View style={styles.chips}>
        {FILTERS.map((f) => (
          <Chip
            key={f.value}
            label={f.value === 'all' && groupId ? (groups.data?.find((g) => g.id === groupId)?.name ?? 'All') : f.label}
            selected={kind === f.value}
            idleBg={colors.bg}
            onPress={() => setKind(f.value)}
          />
        ))}
      </View>
    </View>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <FlatList
        data={rows}
        keyExtractor={(r) => r.key}
        ListHeaderComponent={header}
        contentContainerStyle={{
          paddingHorizontal: spacing.screen,
          paddingTop: 14,
          paddingBottom: sizes.tabBarClearance + insets.bottom,
        }}
        renderItem={({ item: r }) =>
          r.type === 'header' ? (
            <Text variant="overline" color={colors.textFaint} style={{ paddingTop: 12, paddingBottom: 6 }}>
              {r.label}
            </Text>
          ) : (
            <ActivityRow item={r.item} me={myId} />
          )
        }
        ListEmptyComponent={
          q.isLoading ? (
            <SkeletonRows count={6} bg={colors.surface} />
          ) : q.isError ? (
            <ErrorState onRetry={() => q.refetch()} />
          ) : (
            <EmptyState
              icon="receipt"
              title={debounced ? 'No matches' : 'No activity yet'}
              body={debounced ? 'Try a different search.' : 'Expenses, payments and group changes will show up here.'}
            />
          )
        }
        onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage()}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          q.isFetchingNextPage ? (
            <ActivityIndicator style={{ marginVertical: 16 }} color={colors.textFaint} />
          ) : undefined
        }
        refreshing={q.isRefetching && !q.isFetchingNextPage}
        onRefresh={() => q.refetch()}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      />
      <SelectSheet
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        title={t('Filter by group')}
        options={groupOptions}
        value={groupId ?? '__all'}
        onSelect={(v) => setGroupId(v === '__all' ? null : v)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
});
