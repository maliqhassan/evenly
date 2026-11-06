import { StyleSheet, View } from 'react-native';

import { Avatar, Icon, Pressable, StripeFill } from '@/components';
import { colors } from '@/theme';

/** Round photo with a small camera badge (screens 04, 06, personal info). */
export function AvatarPicker({
  uri,
  id,
  name,
  size = 84,
  onPress,
}: {
  uri: string | null;
  id?: string;
  name?: string;
  size?: number;
  onPress: () => void;
}) {
  const badge = size >= 80 ? 30 : 28;
  return (
    <Pressable onPress={onPress} accessibilityLabel="Change profile photo" style={{ width: size, height: size }}>
      {uri ? (
        <Avatar id={id} name={name} uri={uri} size={size} />
      ) : (
        <View style={[styles.placeholder, { width: size, height: size, borderRadius: size / 2 }]}>
          <StripeFill a={colors.avatarStripe[0]} b={colors.avatarStripe[1]} band={8} />
          <Icon name="user" size={size * 0.38} color={colors.textSubtle} />
        </View>
      )}
      <View style={[styles.badge, { width: badge, height: badge, borderRadius: badge / 2 }]}>
        <Icon name="camera" size={badge / 2} color={colors.onDarkStrong} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  placeholder: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    backgroundColor: colors.forest,
    borderWidth: 3,
    borderColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
