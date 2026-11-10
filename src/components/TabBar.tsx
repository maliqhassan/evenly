import { BlurView } from 'expo-blur';
import { router } from 'expo-router';
import type { Tabs } from 'expo-router/js-tabs';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, shadows, sizes } from '@/theme';

import { Icon, type IconName } from './Icon';
import { Pressable } from './Pressable';

type TabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>>[0];

const TAB_META: Record<string, { icon: IconName; label: string }> = {
  index: { icon: 'house', label: 'Home' },
  groups: { icon: 'users', label: 'Groups' },
  activity: { icon: 'receipt', label: 'Activity' },
  friends: { icon: 'user', label: 'Friends' },
};

/**
 * Floating pill tab bar: inset 24, 64 high, white 92% + blur, with a raised
 * centre "Add expense" button. On iOS it sits 26 from the bottom (over the home
 * indicator, per the design); on Android it sits a clear gap above the system
 * navigation buttons, which edge-to-edge draws over the app.
 */
export function TabBar({ state, navigateToTab }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const routes = state.routes.filter((r) => TAB_META[r.name]);
  const half = Math.ceil(routes.length / 2);
  const bottom =
    Platform.OS === 'android' && insets.bottom > 0
      ? insets.bottom + ANDROID_GAP
      : sizes.tabBarBottom + Math.max(0, insets.bottom - 20);

  const renderTab = (route: (typeof routes)[number]) => {
    const meta = TAB_META[route.name]!;
    const focused = state.routes[state.index]?.key === route.key;
    return (
      <Pressable
        key={route.key}
        onPress={() => navigateToTab(route.key)}
        haptic
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={meta.label}
        style={styles.tab}
      >
        <Icon name={meta.icon} size={24} color={focused ? colors.ink : colors.textFaint} />
      </Pressable>
    );
  };

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom }]}
    >
      <View style={[styles.bar, shadows.tabBar]}>
        {Platform.OS === 'ios' ? (
          <BlurView intensity={40} tint="light" style={[StyleSheet.absoluteFill, styles.clip]} />
        ) : null}
        <View style={[StyleSheet.absoluteFill, styles.clip, { backgroundColor: colors.tabBar }]} />
        {routes.slice(0, half).map(renderTab)}
        <Pressable
          onPress={() => router.push('/add-expense')}
          haptic
          accessibilityLabel="Add expense"
          style={[styles.fab, shadows.fab]}
        >
          <Icon name="plus" size={28} color={colors.mint} />
        </Pressable>
        {routes.slice(half).map(renderTab)}
      </View>
    </View>
  );
}

/** Space between the tab bar and Android's navigation buttons. */
const ANDROID_GAP = 10;
const FAB = 58;

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: sizes.tabBarInset, right: sizes.tabBarInset },
  bar: {
    height: sizes.tabBarHeight,
    borderRadius: sizes.tabBarHeight / 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
  clip: { borderRadius: sizes.tabBarHeight / 2, overflow: 'hidden' },
  tab: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  // Raised above the bar, ringed in white so it reads as the main action.
  fab: {
    width: FAB,
    height: FAB,
    borderRadius: FAB / 2,
    marginTop: -22,
    backgroundColor: colors.forest,
    borderWidth: 4,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
