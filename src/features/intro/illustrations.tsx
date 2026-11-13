import { StyleSheet, View } from 'react-native';

import { AmountText, Avatar, Icon, IconTile, Logo, Text } from '@/components';
import { t } from '@/i18n';
import { colors, radii, shadows, spacing } from '@/theme';

// Example people and amounts for the feature tour (not user data).
const CUR = 'PKR';
const SARA = { id: 'intro-sara', name: 'Sara' };
const ALI = { id: 'intro-ali', name: 'Ali' };
const YOU = { id: 'intro-you', name: 'You' };

/** 1 — Split any bill: an expense card split three ways. */
export function SplitIllustration() {
  return (
    <View style={[styles.card, shadows.float]}>
      <View style={styles.row}>
        <IconTile icon="shopping-cart" size={40} radius={12} bg={colors.positiveSoft} fg={colors.positive} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="bodyStrong">Groceries</Text>
          <Text variant="caption" color={colors.textSubtle}>
            Paid by you · House Mate
          </Text>
        </View>
        <AmountText minor={450000} currency={CUR} variant="bodyStrong" />
      </View>
      <View style={styles.divider} />
      {[YOU, SARA, ALI].map((p) => (
        <View key={p.id} style={styles.row}>
          <Avatar id={p.id} name={p.name} size={30} />
          <Text variant="body" style={{ flex: 1 }}>
            {p.name}
          </Text>
          <AmountText minor={150000} currency={CUR} variant="bodyMedium" />
        </View>
      ))}
      <View style={styles.pill}>
        <Icon name="equal" size={14} color={colors.forest} />
        <Text variant="captionStrong" color={colors.forest}>
          {t('Split equally')}
        </Text>
      </View>
    </View>
  );
}

/** 2 — Know who owes what: net balance with who owes whom. */
export function BalancesIllustration() {
  return (
    <View style={[styles.card, shadows.float, { padding: 0, overflow: 'hidden' }]}>
      <View style={styles.balanceTop}>
        <Text variant="overlineSm" color={colors.onDarkMuted}>
          {t('NET BALANCE')}
        </Text>
        <AmountText minor={235000} currency={CUR} sign="always" variant="h2" color={colors.onDarkPositive} />
      </View>
      <View style={{ padding: spacing['2xl'], gap: spacing.xl }}>
        <View style={styles.row}>
          <Avatar id={SARA.id} name={SARA.name} size={34} />
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">Sara</Text>
            <Text variant="caption" color={colors.textSubtle}>
              {t('owes you')}
            </Text>
          </View>
          <AmountText minor={320000} currency={CUR} tone="positive" variant="bodyStrong" />
        </View>
        <View style={styles.row}>
          <Avatar id={ALI.id} name={ALI.name} size={34} />
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">Ali</Text>
            <Text variant="caption" color={colors.textSubtle}>
              {t('you owe')}
            </Text>
          </View>
          <AmountText minor={85000} currency={CUR} tone="negative" variant="bodyStrong" />
        </View>
      </View>
    </View>
  );
}

/** 3 — Settle up in a tap: a payment from Ali to you, confirmed. */
export function SettleIllustration() {
  return (
    <View style={{ alignItems: 'center', gap: spacing['3xl'] }}>
      <View style={styles.settleRow}>
        <View style={{ alignItems: 'center', gap: 6 }}>
          <Avatar id={ALI.id} name={ALI.name} size={64} ring={colors.surface} ringWidth={3} />
          <Text variant="captionStrong">Ali</Text>
        </View>
        <View style={styles.arrow}>
          <AmountText minor={85000} currency={CUR} variant="captionStrong" />
          <Icon name="arrow-right" size={22} color={colors.forest} />
        </View>
        <View style={{ alignItems: 'center', gap: 6 }}>
          <Avatar id={YOU.id} name={YOU.name} size={64} ring={colors.surface} ringWidth={3} />
          <Text variant="captionStrong">You</Text>
        </View>
      </View>
      <View style={[styles.chip, shadows.float]}>
        <IconTile icon="check" size={36} round bg={colors.positiveSoft} fg={colors.positive} iconSize={20} />
        <View style={{ gap: 2 }}>
          <AmountText minor={85000} currency={CUR} tone="positive" variant="bodyLgStrong" />
          <Text variant="caption" color={colors.textSubtle}>
            {t('Payment confirmed')}
          </Text>
        </View>
      </View>
    </View>
  );
}

/** 4 — Groups and notifications: a push banner above group tiles. */
export function GroupsIllustration() {
  return (
    <View style={{ gap: spacing.xl, alignSelf: 'stretch' }}>
      <View style={[styles.banner, shadows.float]}>
        <Logo size="xs" />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="captionStrong">Evenly</Text>
          <Text variant="caption" color={colors.textMuted} numberOfLines={2}>
            Sara added “Dinner” (PKR 3,200.00) in Trip to Hunza
          </Text>
        </View>
      </View>
      <View style={styles.tiles}>
        {[
          { icon: 'house' as const, name: 'House Mate', people: 3 },
          { icon: 'plane' as const, name: 'Trip to Hunza', people: 5 },
        ].map((g) => (
          <View key={g.name} style={[styles.tile, shadows.float]}>
            <IconTile icon={g.icon} size={40} radius={12} bg={colors.forestCard} fg={colors.mint} />
            <View style={{ gap: 2 }}>
              <Text variant="bodyStrong" numberOfLines={1}>
                {g.name}
              </Text>
              <Text variant="caption" color={colors.textSubtle}>
                {g.people} people
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderRadius: radii.cardLg,
    padding: spacing['2xl'],
    gap: spacing.xl,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xl },
  divider: { height: 1, backgroundColor: colors.divider },
  pill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.mint,
  },
  balanceTop: { backgroundColor: colors.forest, padding: spacing['2xl'], gap: 4 },
  settleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xl },
  arrow: { alignItems: 'center', gap: 2, paddingHorizontal: spacing.md },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 18,
    backgroundColor: colors.surface,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xl,
    padding: spacing.xl,
    borderRadius: 20,
    backgroundColor: colors.surface,
  },
  tiles: { flexDirection: 'row', gap: spacing.xl },
  tile: { flex: 1, padding: spacing.xl, borderRadius: radii.card, backgroundColor: colors.surface, gap: spacing.xl },
});
