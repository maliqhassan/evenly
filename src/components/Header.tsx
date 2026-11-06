import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { colors, sizes } from '@/theme';

import { IconButton } from './IconButton';
import { type IconName } from './Icon';
import { Text } from './Text';

export interface HeaderProps {
  title?: string;
  subtitle?: string;
  /** Left action: back arrow (default), close (modals), or none. */
  left?: 'back' | 'close' | 'none';
  onLeft?: () => void;
  right?: React.ReactNode;
  /** Icon-button tone — white on bg screens, muted on white screens. */
  tone?: 'white' | 'muted' | 'onDark';
}

/** Nav bar: 44pt circular back/close button, centred title (17/600) with optional subtitle. */
export function Header({ title, subtitle, left = 'back', onLeft, right, tone = 'white' }: HeaderProps) {
  const leftIcon: IconName = left === 'close' ? 'x' : 'arrow-left';
  const handleLeft = onLeft ?? (() => (router.canGoBack() ? router.back() : router.replace('/')));
  return (
    <View style={styles.row}>
      {left === 'none' ? (
        <View style={styles.side} />
      ) : (
        <IconButton icon={leftIcon} label={left === 'close' ? 'Close' : 'Back'} tone={tone} onPress={handleLeft} />
      )}
      <View style={styles.center}>
        {title ? (
          <Text
            variant="nav"
            numberOfLines={1}
            accessibilityRole="header"
            color={tone === 'onDark' ? colors.onDark : colors.ink}
          >
            {title}
          </Text>
        ) : null}
        {subtitle ? (
          <Text variant="caption" color={colors.textSubtle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={[styles.side, styles.right]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: sizes.iconButton },
  center: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  side: { minWidth: sizes.iconButton },
  right: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
});
