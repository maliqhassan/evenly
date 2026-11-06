import { StatusBar } from 'expo-status-bar';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, sizes, spacing } from '@/theme';

export interface ScreenProps {
  children: React.ReactNode;
  bg?: string;
  /** Scrollable content (default true). */
  scroll?: boolean;
  /** Horizontal padding (20 default, 24 for auth). */
  padding?: number;
  gap?: number;
  /** Fixed footer (e.g. primary button), kept above the keyboard and home indicator. */
  footer?: React.ReactNode;
  /** Extra bottom space so content clears the floating tab bar. */
  withTabBar?: boolean;
  /** Content rendered edge-to-edge above the padded content (e.g. dark headers). */
  header?: React.ReactNode;
  statusBar?: 'dark' | 'light';
  contentStyle?: StyleProp<ViewStyle>;
  refreshing?: boolean;
  onRefresh?: () => void;
  topInset?: boolean;
  /** Absolute overlay (FAB, tab bar…). */
  overlay?: React.ReactNode;
}

export function Screen({
  children,
  bg = colors.bg,
  scroll = true,
  padding = spacing.screen,
  gap = spacing['4xl'],
  footer,
  withTabBar,
  header,
  statusBar = 'dark',
  contentStyle,
  refreshing,
  onRefresh,
  topInset = true,
  overlay,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const bottomPad = withTabBar
    ? sizes.tabBarClearance + insets.bottom
    : footer
      ? spacing['5xl']
      : insets.bottom + spacing['7xl'];
  const content = [
    { paddingHorizontal: padding, gap, paddingTop: header ? spacing['3xl'] : spacing['2xl'], paddingBottom: bottomPad },
    contentStyle,
  ];

  return (
    <View style={[styles.root, { backgroundColor: bg, paddingTop: header || !topInset ? 0 : insets.top }]}>
      <StatusBar style={statusBar} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={[!header && styles.grow, { flexGrow: 1 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            refreshControl={
              onRefresh ? (
                <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.textFaint} />
              ) : undefined
            }
          >
            {header}
            <View style={content}>{children}</View>
          </ScrollView>
        ) : (
          <View style={styles.flex}>
            {header}
            <View style={[styles.flex, content]}>{children}</View>
          </View>
        )}
        {footer ? (
          <View
            style={[
              styles.footer,
              { paddingHorizontal: padding, paddingBottom: Math.max(insets.bottom, spacing['3xl']) + spacing.xl },
            ]}
          >
            {footer}
          </View>
        ) : null}
      </KeyboardAvoidingView>
      {overlay}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  grow: { flexGrow: 1 },
  footer: { paddingTop: spacing.xl, gap: spacing['2xl'] },
});
