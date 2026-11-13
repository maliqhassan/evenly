import { useQueryClient } from '@tanstack/react-query';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, Pressable, Text } from '@/components';
import { t } from '@/i18n';
import { useConnectivity } from '@/lib/offline';
import { colors, radii, shadows } from '@/theme';

/** Visible sync status when the server can't be reached (FR-092). */
export function OfflineBanner() {
  const offline = useConnectivity((s) => s.offline);
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  if (!offline) return null;
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + 6 }]}>
      <Pressable
        onPress={() => qc.refetchQueries({ type: 'active' })}
        accessibilityRole="alert"
        accessibilityLabel="You're offline. Showing saved data. Tap to retry."
        style={[styles.banner, shadows.float]}
      >
        <Icon name="wifi-off" size={16} color={colors.warning} />
        <Text variant="captionMedium" style={{ flex: 1 }}>
          {t('You’re offline — showing saved data')}
        </Text>
        <Text variant="captionStrong" color={colors.positive}>
          {t('Retry')}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radii.xl,
    backgroundColor: colors.warningSoft,
  },
});
