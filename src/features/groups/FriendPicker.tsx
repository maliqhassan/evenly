import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import type { Friend } from '@/api';
import { Avatar, Button, Checkbox, Pressable, SearchField, Sheet, Text } from '@/components';
import { colors, spacing } from '@/theme';

/** Multi-select of friends (people from your other groups). */
export function FriendPicker({
  visible,
  onClose,
  friends,
  selected,
  onDone,
  exclude = [],
}: {
  visible: boolean;
  onClose: () => void;
  friends: Friend[];
  selected: string[];
  onDone: (ids: string[]) => void;
  exclude?: string[];
}) {
  const [picked, setPicked] = useState<string[]>(selected);
  const [q, setQ] = useState('');
  const list = friends.filter(
    (f) =>
      !exclude.includes(f.profileId) && `${f.name} ${f.email ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()),
  );
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <Sheet visible={visible} onClose={onClose} title="Add members" tall>
      <View style={{ paddingHorizontal: spacing.screen, gap: spacing.md }}>
        <SearchField value={q} onChangeText={setQ} placeholder="Search friends" bg={colors.surface} />
        <Text variant="caption" color={colors.textSubtle}>
          They’ll get an invitation to join. You can also share an invite link after creating the group.
        </Text>
      </View>
      <FlatList
        data={list}
        keyExtractor={(f) => f.profileId}
        contentContainerStyle={{ paddingHorizontal: spacing.screen, paddingVertical: spacing.md }}
        ListEmptyComponent={
          <Text variant="secondary" color={colors.textMuted} align="center" style={{ paddingVertical: 24 }}>
            {friends.length ? 'No matches.' : 'No friends yet — share an invite link once the group exists.'}
          </Text>
        }
        renderItem={({ item: f }) => (
          <Pressable
            onPress={() => toggle(f.profileId)}
            scaleOnPress={false}
            style={styles.row}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: picked.includes(f.profileId) }}
            accessibilityLabel={f.name}
          >
            <Avatar id={f.profileId} name={f.name} uri={f.avatarUrl} size={36} />
            <View style={{ flex: 1 }}>
              <Text variant="bodyMedium">{f.name}</Text>
              <Text variant="caption" color={colors.textFaint}>
                {f.groupNames.join(' · ')}
              </Text>
            </View>
            <Checkbox checked={picked.includes(f.profileId)} onPress={() => toggle(f.profileId)} label={f.name} />
          </Pressable>
        )}
      />
      <View style={{ paddingHorizontal: spacing.screen }}>
        <Button
          label={picked.length ? `Add ${picked.length} ${picked.length === 1 ? 'person' : 'people'}` : 'Done'}
          onPress={() => {
            onDone(picked);
            onClose();
          }}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
});
