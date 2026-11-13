import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useRef, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, LinearFill, Pressable, RadialFill, Text, Wordmark } from '@/components';
import { msg, t } from '@/i18n';
import {
  BalancesIllustration,
  GroupsIllustration,
  SettleIllustration,
  SplitIllustration,
} from '@/features/intro/illustrations';
import { useIntro } from '@/stores/intro';
import { colors, radii, spacing } from '@/theme';

const PAGES = [
  {
    key: 'split',
    title: msg('Split any bill'),
    body: msg('Add an expense and Evenly splits it equally, by exact amounts or by percentage, down to the last cent.'),
    Art: SplitIllustration,
  },
  {
    key: 'balances',
    title: msg('Know who owes what'),
    body: msg('One balance per person across all your groups. Green is owed to you, red is what you owe.'),
    Art: BalancesIllustration,
  },
  {
    key: 'settle',
    title: msg('Settle up in a tap'),
    body: msg('Record a payment and the other person confirms it. Balances update for everyone straight away.'),
    Art: SettleIllustration,
  },
  {
    key: 'groups',
    title: msg('Made for your groups'),
    body: msg('Homes, trips and teams. Invite friends with a link or QR code and get notified when anything changes.'),
    Art: GroupsIllustration,
  },
] as const;

/** First-launch feature tour, shown once per install before Welcome. */
export default function Intro() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const list = useRef<FlatList<(typeof PAGES)[number]>>(null);
  const [index, setIndex] = useState(0);
  const last = index === PAGES.length - 1;

  const finish = () => {
    useIntro.getState().markSeen();
    router.replace('/welcome');
  };
  const next = () => {
    if (last) return finish();
    list.current?.scrollToIndex({ index: index + 1, animated: true });
    setIndex(index + 1);
  };
  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) =>
    setIndex(Math.round(e.nativeEvent.contentOffset.x / width));

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <LinearFill colors={colors.welcomeGradient} offsets={[0, 0.4, 0.62, 0.8]} />

      <View style={styles.top}>
        <Wordmark />
        {last ? (
          <View style={styles.skip} />
        ) : (
          <Pressable
            onPress={finish}
            accessibilityRole="button"
            accessibilityLabel="Skip the tour"
            hitSlop={8}
            style={styles.skip}
          >
            <Text variant="bodyMedium" color={colors.textMuted}>
              {t('Skip')}
            </Text>
          </Pressable>
        )}
      </View>

      <FlatList
        ref={list}
        data={PAGES}
        keyExtractor={(p) => p.key}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        renderItem={({ item, index: i }) => (
          <View
            style={[styles.page, { width }]}
            accessibilityLabel={`Step ${i + 1} of ${PAGES.length}: ${t(item.title)}`}
          >
            <View style={styles.stage}>
              <RadialFill colors={colors.mintGradientSoft} cy="0%" rx="120%" ry="110%" />
              <item.Art />
            </View>
            <View style={styles.copy}>
              <Text variant="h1" align="center" accessibilityRole="header">
                {t(item.title)}
              </Text>
              <Text variant="bodyLg" color={colors.textMuted} align="center">
                {t(item.body)}
              </Text>
            </View>
          </View>
        )}
      />

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing['3xl']) + spacing.xl }]}>
        <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {PAGES.map((p, i) => (
            <View key={p.key} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
        <Button
          label={last ? t('Get started') : t('Next')}
          icon={last ? undefined : 'arrow-right'}
          onPress={next}
          accessibilityHint={last ? t('Finishes the tour') : t('Shows the next step')}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.screen,
    paddingTop: spacing.xl,
  },
  skip: { minWidth: 44, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  page: { flex: 1, paddingHorizontal: spacing.screen, paddingTop: spacing['2xl'], gap: spacing['4xl'] },
  stage: {
    flex: 1,
    borderRadius: radii.photo,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing['3xl'],
    backgroundColor: colors.positiveSoft,
  },
  copy: { gap: spacing.lg, paddingHorizontal: spacing.md, minHeight: 130 },
  footer: { paddingHorizontal: spacing.screen, paddingTop: spacing.xl, gap: spacing['3xl'] },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.disabled },
  dotActive: { width: 22, backgroundColor: colors.forest },
});
