import { Image } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, fontFamily } from '@/theme';

import { Text } from './Text';

/** Deterministic avatar fill from a stable id (FNV-1a hash). */
export function avatarFill(id: string | null | undefined): string {
  if (!id) return colors.avatarDeleted;
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return colors.avatarFills[(h >>> 0) % colors.avatarFills.length]!;
}

export function initialOf(name: string | null | undefined): string {
  const n = (name ?? '').trim();
  return n ? n[0]!.toUpperCase() : '?';
}

export interface AvatarProps {
  id?: string | null;
  name?: string | null;
  uri?: string | null;
  size?: number;
  /** Ring colour (matches the surface behind stacked avatars). */
  ring?: string;
  ringWidth?: number;
  style?: StyleProp<ViewStyle>;
  muted?: boolean;
}

export function Avatar({ id, name, uri, size = 40, ring, ringWidth = 2, style, muted }: AvatarProps) {
  const fill = muted ? colors.avatarDeleted : avatarFill(id ?? name);
  const fontSize = Math.round(size * 0.36);
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={name ?? 'Avatar'}
      style={[
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: fill,
          borderWidth: ring ? ringWidth : 0,
          borderColor: ring,
        },
        style,
      ]}
    >
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
      ) : (
        <Text style={{ fontSize, fontFamily: fontFamily.semibold }} color={colors.forest}>
          {initialOf(name)}
        </Text>
      )}
    </View>
  );
}

export interface AvatarStackProps {
  people: { id: string; name?: string | null; uri?: string | null }[];
  size?: number;
  max?: number;
  ring?: string;
}

/** Overlapping avatars with a "+N" chip, as on group cards. */
export function AvatarStack({ people, size = 26, max = 3, ring = colors.bg }: AvatarStackProps) {
  const shown = people.length > max ? people.slice(0, max - 1) : people;
  const extra = people.length - shown.length;
  return (
    <View style={styles.stack} accessibilityLabel={`${people.length} members`}>
      {shown.map((p, i) => (
        <Avatar
          key={p.id}
          id={p.id}
          name={p.name}
          uri={p.uri}
          size={size}
          ring={ring}
          style={i > 0 ? { marginLeft: -8 } : undefined}
        />
      ))}
      {extra > 0 ? (
        <View style={[styles.more, { height: size, borderRadius: size / 2, borderColor: ring, marginLeft: -8 }]}>
          <Text variant="microStrong">+{extra}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  stack: { flexDirection: 'row', alignItems: 'center' },
  more: {
    paddingHorizontal: 7,
    backgroundColor: colors.surface,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
