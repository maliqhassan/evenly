import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { errorMessage } from '@/api';
import { Avatar, Button, Card, Header, Icon, Pressable, Screen, Text, toast } from '@/components';
import { FriendPicker } from '@/features/groups/FriendPicker';
import { GroupFormFields, type GroupFormValue } from '@/features/groups/GroupForm';
import { track } from '@/lib/monitoring';
import { useCreateGroup, useFriends } from '@/queries';
import { groupSchema } from '@/schemas';
import { useSession } from '@/stores/session';
import { colors, radii } from '@/theme';

/** 12 — Create group (modal) */
export default function NewGroup() {
  const me = useSession((s) => s.me!);
  const [value, setValue] = useState<GroupFormValue>({
    name: '',
    type: 'home',
    currency: me.profile.defaultCurrency,
    icon: 'house',
  });
  const [invitees, setInvitees] = useState<string[]>([]);
  const [picker, setPicker] = useState(false);
  const [touched, setTouched] = useState(false);
  const friends = useFriends();
  const create = useCreateGroup();

  const parsed = groupSchema.safeParse(value);
  const nameError =
    touched && !parsed.success ? (parsed.error.issues.find((i) => i.path[0] === 'name')?.message ?? null) : null;
  const people = (friends.data ?? []).filter((f) => invitees.includes(f.profileId));

  const submit = async () => {
    setTouched(true);
    if (!parsed.success) return;
    try {
      const id = await create.mutateAsync({ ...parsed.data, inviteeIds: invitees });
      track('group_created', { type: value.type, invited: invitees.length });
      router.dismiss();
      router.push({ pathname: '/groups/[id]', params: { id } });
      if (!invitees.length) setTimeout(() => router.push({ pathname: '/groups/[id]/invite', params: { id } }), 350);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Screen
      gap={14}
      contentStyle={{ paddingTop: 8 }}
      footer={<Button label="Create group" onPress={submit} loading={create.isPending} />}
    >
      <Header title="New group" left="close" />
      <GroupFormFields value={value} onChange={setValue} nameError={nameError} />

      <View style={{ gap: 8 }}>
        <Text variant="secondary" color={colors.textMuted}>
          Members · {1 + people.length}
        </Text>
        <Card radius={radii.card}>
          <View style={[styles.row, styles.divider]}>
            <Avatar id={me.profile.id} name={me.profile.fullName} uri={me.profile.avatarUrl} size={34} />
            <Text variant="bodyMedium" style={{ flex: 1 }}>
              You
            </Text>
            <Text variant="caption" color={colors.textFaint}>
              Admin
            </Text>
          </View>
          {people.map((p) => (
            <View key={p.profileId} style={[styles.row, styles.divider]}>
              <Avatar id={p.profileId} name={p.name} uri={p.avatarUrl} size={34} />
              <Text variant="bodyMedium" style={{ flex: 1 }} numberOfLines={1}>
                {p.name}
              </Text>
              <Text variant="caption" color={colors.textFaint}>
                Invited
              </Text>
            </View>
          ))}
          <Pressable
            onPress={() => setPicker(true)}
            scaleOnPress={false}
            style={styles.row}
            accessibilityLabel="Add members"
          >
            <View style={styles.addCircle}>
              <Icon name="plus" size={16} color={colors.positive} />
            </View>
            <Text variant="bodyMedium" color={colors.positive}>
              Add members
            </Text>
          </Pressable>
        </Card>
      </View>

      <FriendPicker
        visible={picker}
        onClose={() => setPicker(false)}
        friends={friends.data ?? []}
        selected={invitees}
        onDone={setInvitees}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  addCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.dashedPositive,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
