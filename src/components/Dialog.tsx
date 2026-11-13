import { useEffect, useState } from 'react';
import { Animated, Easing, Modal, StyleSheet, View } from 'react-native';
import { create } from 'zustand';

import { t } from '@/i18n';
import { colors, radii, shadows, spacing } from '@/theme';

import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { Pressable } from './Pressable';
import { Text } from './Text';

export interface DialogButton {
  text: string;
  /** cancel = quiet, destructive = red, default = the forest primary action. */
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

interface DialogContent {
  title: string;
  message?: string;
  icon?: IconName;
  buttons: DialogButton[];
}

interface DialogState {
  current: DialogContent | null;
  queue: DialogContent[];
  show: (d: DialogContent) => void;
  close: () => void;
}

const useDialog = create<DialogState>((set, get) => ({
  current: null,
  queue: [],
  show: (d) => (get().current ? set((s) => ({ queue: [...s.queue, d] })) : set({ current: d })),
  close: () => set((s) => ({ current: s.queue[0] ?? null, queue: s.queue.slice(1) })),
}));

/**
 * Themed replacement for Alert.alert — same call shape:
 *   alert('Delete this expense?', 'It will be removed…', [{ text: 'Cancel', style: 'cancel' }, …])
 * With no buttons it shows a single t('OK').
 */
export function alert(title: string, message?: string, buttons?: DialogButton[], opts: { icon?: IconName } = {}) {
  useDialog.getState().show({
    title,
    message,
    icon: opts.icon,
    buttons: buttons?.length ? buttons : [{ text: t('OK') }],
  });
}

/** Global dialog host — mount once at the root. */
export function DialogHost() {
  const { current, close } = useDialog();
  const [anim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!current) return;
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [current, anim]);

  if (!current) return null;
  const { title, message, icon, buttons } = current;

  const press = (b?: DialogButton) => {
    close();
    b?.onPress?.();
  };
  const cancel = buttons.find((b) => b.style === 'cancel');
  const actions = buttons.filter((b) => b.style !== 'cancel');
  // Two choices sit side by side; longer lists (action menus) stack.
  const inline = buttons.length <= 2;
  const ordered = inline ? [...(cancel ? [cancel] : []), ...actions] : [...actions, ...(cancel ? [cancel] : [])];

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={() => press(cancel)}>
      <Animated.View style={[styles.backdrop, { opacity: anim }]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => (cancel ? press(cancel) : undefined)}
          scaleOnPress={false}
          accessibilityLabel="Close"
        />
        <Animated.View
          accessibilityViewIsModal
          accessibilityRole="alert"
          style={[
            styles.card,
            shadows.float,
            { transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }] },
          ]}
        >
          {icon ? (
            <View style={styles.icon}>
              <Icon name={icon} size={24} color={colors.forest} />
            </View>
          ) : null}
          <View style={{ gap: spacing.md }}>
            <Text variant="nav" align={icon ? 'center' : 'left'} accessibilityRole="header">
              {title}
            </Text>
            {message ? (
              <Text variant="body" color={colors.textMuted} align={icon ? 'center' : 'left'}>
                {message}
              </Text>
            ) : null}
          </View>
          <View style={inline ? styles.row : styles.stack}>
            {ordered.map((b) => (
              <Button
                key={b.text}
                label={b.text}
                size="md"
                fullWidth
                variant={b.style === 'cancel' ? 'muted' : b.style === 'destructive' ? 'ink' : 'primary'}
                style={[
                  inline ? { flex: 1 } : null,
                  b.style === 'destructive' ? { backgroundColor: colors.negative } : null,
                ]}
                onPress={() => press(b)}
              />
            ))}
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: 'center',
    paddingHorizontal: spacing.screen,
  },
  card: {
    backgroundColor: colors.bg,
    borderRadius: radii.card + 6,
    padding: spacing['3xl'],
    gap: spacing['3xl'],
  },
  icon: {
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.mint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', gap: spacing.md },
  stack: { gap: spacing.md },
});
