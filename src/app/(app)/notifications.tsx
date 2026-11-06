import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { errorMessage, type AppNotification } from '@/api';
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  Header,
  IconButton,
  IconTile,
  Pressable,
  Screen,
  Segmented,
  SkeletonRows,
  Text,
  toast,
} from '@/components';
import { timeAgo } from '@/lib/dates';
import { routeForNotification } from '@/lib/push';
import { useMarkNotificationsRead, useMyInvitations, useNotifications, useRespondInvitation } from '@/queries';
import { colors } from '@/theme';

const STYLE: Record<string, { icon: string; bg: string; fg: string }> = {
  expense_added: { icon: 'receipt', bg: colors.positiveSoft, fg: colors.positive },
  expense_updated: { icon: 'pencil', bg: colors.surfaceMuted, fg: colors.forest },
  expense_deleted: { icon: 'trash-2', bg: colors.surfaceMuted, fg: colors.forest },
  settlement_recorded: { icon: 'circle-check', bg: colors.positiveSoft, fg: colors.positive },
  settlement_confirmed: { icon: 'circle-check', bg: colors.positiveSoft, fg: colors.positive },
  settlement_pending: { icon: 'banknote', bg: colors.warningSoft, fg: colors.warning },
  settlement_rejected: { icon: 'circle-alert', bg: colors.negativeSoft, fg: colors.negative },
  reminder: { icon: 'clock', bg: colors.negativeSoft, fg: colors.negative },
  member_joined: { icon: 'user-plus', bg: colors.surfaceMuted, fg: colors.forest },
  group_invite: { icon: 'users', bg: colors.surfaceMuted, fg: colors.forest },
};

/** 08 — Notifications */
export default function Notifications() {
  const [tab, setTab] = useState<'all' | 'unread'>('all');
  const notes = useNotifications();
  const invites = useMyInvitations();
  const markRead = useMarkNotificationsRead();
  const respond = useRespondInvitation();

  const list = (notes.data ?? []).filter((n) => n.type !== 'group_invite' || n.readAt);
  const unread = (notes.data ?? []).filter((n) => !n.readAt);
  const shown = tab === 'unread' ? list.filter((n) => !n.readAt) : list;

  // Viewing the list clears the badge after a moment.
  useEffect(() => {
    if (!unread.length) return;
    const t = setTimeout(() => markRead.mutate(unread.filter((n) => n.type !== 'group_invite').map((n) => n.id)), 2500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes.dataUpdatedAt]);

  const answer = async (id: string, accept: boolean) => {
    try {
      const groupId = await respond.mutateAsync({ id, accept });
      if (accept) {
        toast.success('You joined the group');
        router.push({ pathname: '/groups/[id]', params: { id: groupId } });
      }
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const open = (n: AppNotification) => {
    if (!n.readAt) markRead.mutate([n.id]);
    routeForNotification({ ...n.data, type: n.type, group_id: n.groupId ?? n.data.group_id });
  };

  return (
    <Screen
      refreshing={notes.isRefetching}
      onRefresh={() => {
        void notes.refetch();
        void invites.refetch();
      }}
    >
      <Header
        title="Notifications"
        right={
          <IconButton
            icon="check-check"
            tone="plain"
            label="Mark all as read"
            onPress={() => markRead.mutate(undefined)}
            disabled={!unread.length}
          />
        }
      />
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'all', label: 'All' },
          { value: 'unread', label: `Unread · ${unread.length}` },
        ]}
      />

      {(invites.data ?? []).map((inv) => (
        <Card key={inv.id} padded style={{ gap: 14 }}>
          <View style={styles.inviteTop}>
            <Avatar id={inv.invitedBy} name={inv.inviterName} size={40} />
            <View style={{ flex: 1, gap: 3 }}>
              <Text variant="body">
                <Text variant="bodyStrong">{inv.inviterName.split(' ')[0]}</Text> invited you to{' '}
                <Text variant="bodyStrong">{inv.groupName}</Text>
              </Text>
              <Text variant="caption" color={colors.textFaint}>
                {inv.memberCount ? `${inv.memberCount} members · ` : ''}
                {inv.currency} · {timeAgo(inv.createdAt)}
              </Text>
            </View>
          </View>
          <View style={styles.inviteActions}>
            <Button
              label="Accept"
              size="md"
              style={{ flex: 1 }}
              onPress={() => answer(inv.id, true)}
              loading={respond.isPending && respond.variables?.id === inv.id && respond.variables.accept}
            />
            <Button
              label="Decline"
              size="md"
              variant="muted"
              style={{ flex: 1 }}
              onPress={() => answer(inv.id, false)}
            />
          </View>
        </Card>
      ))}

      {notes.isLoading ? (
        <SkeletonRows count={5} />
      ) : shown.length === 0 ? (
        <Card>
          <EmptyState
            icon="bell"
            title={tab === 'unread' ? 'You’re all caught up' : 'No notifications yet'}
            body="We’ll let you know when friends add expenses or settle up."
          />
        </Card>
      ) : (
        <Card>
          {shown.map((n, i) => {
            const s = STYLE[n.type] ?? { icon: 'bell', bg: colors.surfaceMuted, fg: colors.forest };
            return (
              <Pressable
                key={n.id}
                onPress={() => open(n)}
                scaleOnPress={false}
                accessibilityLabel={n.body}
                style={[styles.row, i < shown.length - 1 && styles.divider]}
              >
                <IconTile icon={s.icon} size={38} round bg={s.bg} fg={s.fg} iconSize={17} />
                <View style={{ flex: 1, gap: 3 }}>
                  <Text variant="body">{n.body}</Text>
                  <Text variant="caption" color={colors.textFaint}>
                    {timeAgo(n.createdAt)}
                  </Text>
                </View>
                {!n.readAt ? <View style={styles.dot} accessibilityLabel="Unread" /> : null}
              </Pressable>
            );
          })}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  inviteTop: { flexDirection: 'row', gap: 12 },
  inviteActions: { flexDirection: 'row', gap: 10 },
  row: { flexDirection: 'row', gap: 12, paddingVertical: 14, paddingHorizontal: 16, alignItems: 'flex-start' },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.positive, marginTop: 6 },
});
