import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { errorMessage, type Group } from '@/api';
import { alert, Avatar, Button, Card, Header, Icon, Overline, Pressable, Screen, Text, toast } from '@/components';
import { GroupFormFields, type GroupFormValue } from '@/features/groups/GroupForm';
import { activeMembers } from '@/features/people';
import { useGroup, useGroupMembership, useUpdateGroup } from '@/queries';
import { groupSchema } from '@/schemas';
import { useSession } from '@/stores/session';
import { colors, radii } from '@/theme';

/** Group settings: edit details (admins), manage members, archive, leave. */
export default function GroupSettings() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { group } = useGroup(id);
  if (!group) {
    return (
      <Screen>
        <Header title="Group settings" />
      </Screen>
    );
  }
  // Mount the form once the group is known so it can seed its initial state.
  return <GroupSettingsForm group={group} />;
}

function GroupSettingsForm({ group }: { group: Group }) {
  const id = group.id;
  const myId = useSession((s) => s.me!.profile.id);
  const update = useUpdateGroup(id);
  const { archive, leave, remove } = useGroupMembership();
  const [value, setValue] = useState<GroupFormValue>({
    name: group.name,
    type: group.type,
    currency: group.currency,
    icon: group.icon,
  });

  const myRole = group.members.find((m) => m.profileId === myId)?.role;
  const isAdmin = myRole === 'owner' || myRole === 'admin';
  const parsed = groupSchema.safeParse(value);
  const dirty =
    value.name !== group.name ||
    value.type !== group.type ||
    value.currency !== group.currency ||
    value.icon !== group.icon;

  const save = async () => {
    if (!parsed.success) return;
    try {
      await update.mutateAsync({ ...parsed.data, description: group.description });
      toast.success('Group updated');
      router.back();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const confirm = (title: string, message: string, action: string, run: () => Promise<unknown>, destructive = true) =>
    alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: action,
        style: destructive ? 'destructive' : 'default',
        onPress: () => run().catch((e) => toast.error(errorMessage(e))),
      },
    ]);

  return (
    <Screen
      gap={16}
      footer={
        isAdmin ? (
          <Button label="Save changes" onPress={save} disabled={!dirty || !parsed.success} loading={update.isPending} />
        ) : undefined
      }
    >
      <Header title="Group settings" />
      {isAdmin ? (
        <GroupFormFields value={value} onChange={setValue} />
      ) : (
        <Text variant="secondary" color={colors.textMuted}>
          Only group admins can change the name, type or currency.
        </Text>
      )}

      <View style={{ gap: 8 }}>
        <Overline>MEMBERS</Overline>
        <Card radius={radii.card}>
          {activeMembers(group).map((m, i, arr) => (
            <View key={m.profileId} style={[styles.row, i < arr.length - 1 && styles.divider]}>
              <Avatar id={m.profileId} name={m.name} uri={m.avatarUrl} size={34} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyMedium">{m.profileId === myId ? `${m.name} (you)` : m.name}</Text>
                <Text variant="caption" color={colors.textFaint}>
                  {m.role === 'owner' ? 'Owner' : m.role === 'admin' ? 'Admin' : 'Member'}
                </Text>
              </View>
              {isAdmin && m.profileId !== myId && m.role !== 'owner' ? (
                <Pressable
                  onPress={() =>
                    confirm(
                      `Remove ${m.name}?`,
                      'They must be settled up first. Their past expenses stay in the history.',
                      'Remove',
                      () => remove.mutateAsync({ groupId: id, profileId: m.profileId }),
                    )
                  }
                  accessibilityLabel={`Remove ${m.name}`}
                  hitSlop={10}
                >
                  <Icon name="x" size={18} color={colors.textFaint} />
                </Pressable>
              ) : null}
            </View>
          ))}
          <Pressable
            onPress={() => router.push({ pathname: '/groups/[id]/invite', params: { id } })}
            scaleOnPress={false}
            style={styles.row}
            accessibilityLabel="Invite members"
          >
            <Icon name="user-plus" size={18} color={colors.positive} />
            <Text variant="bodyMedium" color={colors.positive}>
              Invite members
            </Text>
          </Pressable>
        </Card>
      </View>

      <Card radius={radii.card}>
        {isAdmin ? (
          <Pressable
            style={[styles.row, styles.divider]}
            scaleOnPress={false}
            accessibilityLabel={group.archivedAt ? 'Restore group' : 'Archive group'}
            onPress={() =>
              group.archivedAt
                ? archive
                    .mutateAsync({ groupId: id, archived: false })
                    .then(() => toast.success('Group restored'))
                    .catch((e) => toast.error(errorMessage(e)))
                : confirm(
                    'Archive this group?',
                    'It moves to Archived. History and balances are kept, and you can restore it any time.',
                    'Archive',
                    () => archive.mutateAsync({ groupId: id, archived: true }).then(() => router.back()),
                    false,
                  )
            }
          >
            <Icon name="archive" size={18} color={colors.forest} />
            <Text variant="bodyMedium">{group.archivedAt ? 'Restore group' : 'Archive group'}</Text>
          </Pressable>
        ) : null}
        <Pressable
          style={styles.row}
          scaleOnPress={false}
          accessibilityLabel="Leave group"
          onPress={() =>
            confirm('Leave this group?', 'You need to be settled up before leaving.', 'Leave', async () => {
              await leave.mutateAsync(id);
              router.dismissTo('/groups');
            })
          }
        >
          <Icon name="log-out" size={18} color={colors.negative} />
          <Text variant="bodyMedium" color={colors.negative}>
            Leave group
          </Text>
        </Pressable>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    minHeight: 52,
  },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
});
