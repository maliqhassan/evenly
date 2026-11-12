import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { errorMessage, type RecurringExpense, type RepeatFrequency } from '@/api';
import {
  alert,
  AmountText,
  Card,
  EmptyState,
  Header,
  IconTile,
  Pill,
  Pressable,
  Screen,
  SkeletonRows,
  Text,
  toast,
} from '@/components';
import { categoryIcon } from '@/features/expenses/categories';
import { usePeople } from '@/features/people';
import { usePreferences } from '@/hooks/usePreferences';
import { formatRelativeDay } from '@/lib/dates';
import { useDeleteRecurring, useGroup, useRecurring, useSetRecurringActive } from '@/queries';
import { useSession } from '@/stores/session';
import { colors, radii } from '@/theme';

const EVERY: Record<RepeatFrequency, string> = { weekly: 'Every week', monthly: 'Every month', yearly: 'Every year' };

/** Why a recurring expense paused itself, in plain words. */
function pausedReason(error: string | null): string {
  if (!error) return 'Paused';
  if (error.includes('invalid_participant')) return 'Paused: someone in the split is no longer in the group';
  if (error.includes('group_archived')) return 'Paused: the group is archived';
  if (error.includes('creator_unavailable')) return 'Paused: the person who set it up left Evenly';
  return 'Paused: the last expense couldn’t be created';
}

/** Recurring expenses of a group: see what repeats, pause it, or remove it. */
export default function Recurring() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const myId = useSession((s) => s.me!.profile.id);
  const { group } = useGroup(id);
  const list = useRecurring(id);
  const setActive = useSetRecurringActive(id);
  const remove = useDeleteRecurring(id);
  const people = usePeople();
  const { dateFormat } = usePreferences();

  const myRole = group?.members.find((m) => m.profileId === myId)?.role;
  const isAdmin = myRole === 'owner' || myRole === 'admin';
  const items = list.data ?? [];

  const toggle = (r: RecurringExpense) =>
    setActive.mutate(
      { id: r.id, active: !r.active },
      {
        onSuccess: () => toast.success(r.active ? 'Paused' : 'Resumed'),
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  const confirmRemove = (r: RecurringExpense) =>
    alert(`Stop “${r.description}”?`, 'No new expenses will be created. The ones already added stay in the group.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Stop repeating',
        style: 'destructive',
        onPress: () =>
          remove.mutate(r.id, {
            onSuccess: () => toast.success('Removed'),
            onError: (e) => toast.error(errorMessage(e)),
          }),
      },
    ]);

  return (
    <Screen gap={16}>
      <Header title="Recurring expenses" subtitle={group?.name} />
      <Text variant="secondary" color={colors.textMuted}>
        These are added to the group automatically, at the same time each week, month or year. Set one up with Repeat
        when you add an expense.
      </Text>

      {list.isLoading ? (
        <SkeletonRows count={3} />
      ) : items.length === 0 ? (
        <Card tone="bg" radius={radii.card}>
          <EmptyState
            icon="refresh-cw"
            title="Nothing repeats yet"
            body="When you add an expense, choose Repeat to make it happen every week, month or year."
          />
        </Card>
      ) : (
        <Card radius={radii.card}>
          {items.map((r, i) => {
            const canManage = r.createdBy === myId || isAdmin;
            return (
              <View key={r.id} style={[styles.row, i < items.length - 1 && styles.divider]}>
                <View style={styles.top}>
                  <IconTile
                    icon={categoryIcon(r.categoryId)}
                    size={40}
                    radius={12}
                    bg={r.active ? colors.positiveSoft : colors.surfaceMuted}
                    fg={r.active ? colors.positive : colors.textFaint}
                  />
                  <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                    <Text variant="bodyStrong" numberOfLines={1}>
                      {r.description}
                    </Text>
                    <Text variant="caption" color={colors.textSubtle} numberOfLines={1}>
                      {EVERY[r.frequency]} · paid by {people.label(r.paidBy)}
                    </Text>
                  </View>
                  <AmountText minor={r.amount} currency={r.currency} variant="bodyStrong" />
                </View>

                <View style={styles.bottom}>
                  {r.active ? (
                    <Text variant="caption" color={colors.textMuted} style={{ flex: 1 }}>
                      Next on {formatRelativeDay(r.nextRun, dateFormat)}
                    </Text>
                  ) : (
                    <View style={{ flex: 1, alignItems: 'flex-start' }}>
                      <Pill label={pausedReason(r.lastError)} tone="warning" variant="soft" />
                    </View>
                  )}
                  {canManage ? (
                    <View style={styles.actions}>
                      <Pressable
                        onPress={() => toggle(r)}
                        accessibilityRole="button"
                        accessibilityLabel={`${r.active ? 'Pause' : 'Resume'} ${r.description}`}
                        hitSlop={8}
                        style={styles.action}
                      >
                        <Text variant="captionStrong" color={colors.forest}>
                          {r.active ? 'Pause' : 'Resume'}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => confirmRemove(r)}
                        accessibilityRole="button"
                        accessibilityLabel={`Stop repeating ${r.description}`}
                        hitSlop={8}
                        style={styles.action}
                      >
                        <Text variant="captionStrong" color={colors.negative}>
                          Stop
                        </Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { gap: 10, paddingVertical: 14, paddingHorizontal: 14 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bottom: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 52 },
  actions: { flexDirection: 'row', gap: 6 },
  action: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
