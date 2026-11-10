import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/theme';

/**
 * Android draws the app edge-to-edge, so the system navigation buttons float
 * over whatever scrolls beneath them. This frosted strip under the buttons
 * keeps them readable and stops content showing through.
 */
export function NavigationBarScrim() {
  const { bottom } = useSafeAreaInsets();
  if (Platform.OS !== 'android' || bottom === 0) return null;
  return <View pointerEvents="none" style={[styles.scrim, { height: bottom }]} />;
}

const styles = StyleSheet.create({
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.frosted,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
});
