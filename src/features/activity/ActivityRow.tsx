import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import type { ActivityItem } from '@/api';
import { AmountText, IconTile, Pressable, Text } from '@/components';
import { colors } from '@/theme';

import { describeActivity } from './describe';

/** Activity list row (screen 09): square icon tile, title, subtitle, signed amount + note. */
export function ActivityRow({ item, me }: { item: ActivityItem; me: string }) {
  const v = describeActivity(item, me);
  const content = (
    <View style={styles.row}>
      <IconTile
        icon={v.icon}
        size={40}
        radius={12}
        bg={v.tone === 'positive' ? colors.positiveSoft : colors.surfaceMuted}
        fg={v.tone === 'positive' ? colors.positive : colors.forest}
      />
      <View style={styles.text}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {v.title}
        </Text>
        <Text variant="caption" color={colors.textSubtle} numberOfLines={1}>
          {v.subtitle}
        </Text>
      </View>
      {v.amount ? (
        <View style={styles.right}>
          <AmountText minor={v.amount.minor} currency={v.amount.currency} sign={v.amount.sign} tone={v.amount.tone} />
          {v.note ? (
            <Text variant="micro" color={colors.textFaint}>
              {v.note}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
  if (!v.href) return content;
  const href = v.href;
  return (
    <Pressable onPress={() => router.push(href)} scaleOnPress={false} accessibilityLabel={`${v.title}, ${v.subtitle}`}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, minHeight: 60 },
  text: { flex: 1, gap: 2, minWidth: 0 },
  right: { alignItems: 'flex-end', gap: 2 },
});
