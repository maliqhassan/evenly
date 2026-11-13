import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { api, errorMessage } from '@/api';
import {
  alert,
  Avatar,
  Button,
  Card,
  Header,
  Icon,
  IconTile,
  ListRow,
  Overline,
  Pressable,
  Screen,
  Sheet,
  Text,
  toast,
} from '@/components';
import { authClient } from '@/lib/auth';
import { config, isDemo } from '@/lib/config';
import { forgetLocalData, signOut } from '@/lib/session';
import { useSession } from '@/stores/session';
import { colors, radii, spacing } from '@/theme';

/** 23 — Profile & settings */
export default function Profile() {
  const me = useSession((s) => s.me!);
  const [plus, setPlus] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const p = me.profile;
  const prefs = me.preferences;

  const logOut = () =>
    alert('Log out of Evenly?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => void signOut() },
    ]);

  const deleteAccount = () =>
    alert(
      'Delete your account?',
      'Your profile is removed and you leave all groups. Expenses other people rely on stay in their history as “Deleted user”. You must be settled up first. This can’t be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await api.deleteAccount();
              await forgetLocalData(p.id);
              await authClient.deleteUser().catch(() => authClient.signOut());
              toast.success('Your account was deleted');
            } catch (e) {
              toast.error(errorMessage(e));
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );

  const sections = [
    {
      title: 'ACCOUNT',
      items: [
        { icon: 'user', label: 'Personal info', value: '', onPress: () => router.push('/settings/personal') },
        {
          icon: 'link',
          label: 'Sign-in method',
          value: 'Google',
          onPress: () =>
            alert(
              'Sign-in method',
              `You sign in with Google${p.email ? ` (${p.email})` : ''}. Evenly never stores a password.`,
            ),
        },
        {
          icon: 'banknote',
          label: 'Currency & region',
          value: `${p.defaultCurrency} · ${prefs.region}`,
          onPress: () => router.push('/settings/region'),
        },
        {
          icon: 'bell',
          label: 'Notifications',
          value: prefs.notifyPush ? 'On' : 'Off',
          onPress: () => router.push('/settings/notifications'),
        },
      ],
    },
    {
      title: 'APP',
      items: [
        { icon: 'chart-pie', label: 'Reports', value: '', onPress: () => router.push('/reports') },
        {
          icon: 'moon',
          label: 'Appearance',
          value: 'Light',
          onPress: () => alert('Appearance', 'Dark mode is on its way. Evenly uses the light theme for now.'),
        },
        {
          icon: 'circle-help',
          label: 'Help & support',
          value: '',
          onPress: () => Linking.openURL(`mailto:${config.supportEmail}?subject=Evenly%20support`),
        },
        { icon: 'shield', label: 'Privacy & terms', value: '', onPress: () => router.push('/settings/legal') },
      ],
    },
  ];

  return (
    <Screen gap={16}>
      <Header title="Profile" />

      <View style={styles.identity}>
        <Avatar id={p.id} name={p.fullName} uri={p.avatarUrl} size={64} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="nav" style={{ fontSize: 19 }} numberOfLines={1}>
            {p.fullName}
          </Text>
          <Text variant="secondary" color={colors.textSubtle} numberOfLines={1}>
            {p.email ?? 'Signed in with Google'}
          </Text>
        </View>
        <Button
          label="Edit"
          size="sm"
          variant="secondary"
          fullWidth={false}
          style={{ height: 36 }}
          onPress={() => router.push('/settings/personal')}
        />
      </View>

      <Pressable onPress={() => setPlus(true)} accessibilityLabel="Evenly Plus" style={styles.plus}>
        <IconTile icon="crown" size={44} radius={14} bg={colors.mint} fg={colors.forest} iconSize={20} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="bodyLgStrong" color={colors.onDark}>
            Evenly Plus
          </Text>
          <Text variant="caption" color={colors.onDarkMuted}>
            Exports, currency conversion · $3.99/mo
          </Text>
        </View>
        <Icon name="chevron-right" size={18} color={colors.onDark} />
      </Pressable>

      {sections.map((sec) => (
        <View key={sec.title} style={{ gap: 6 }}>
          <Overline style={{ paddingLeft: 4 }}>{sec.title}</Overline>
          <Card radius={radii.card}>
            {sec.items.map((it, i) => (
              <ListRow
                key={it.label}
                title={it.label}
                value={it.value}
                left={<IconTile icon={it.icon} size={32} radius={9} iconSize={16} fg={colors.ink} />}
                chevron
                divider={i < sec.items.length - 1}
                onPress={it.onPress}
              />
            ))}
          </Card>
        </View>
      ))}

      <Pressable onPress={logOut} accessibilityLabel="Log out" style={styles.logout}>
        <Icon name="log-out" size={18} color={colors.negative} />
        <Text variant="bodyStrong" color={colors.negative}>
          Log out
        </Text>
      </Pressable>

      <Pressable
        onPress={deleteAccount}
        disabled={deleting}
        accessibilityRole="button"
        accessibilityLabel="Delete account"
        scaleOnPress={false}
        style={{ alignSelf: 'center', padding: 8 }}
      >
        <Text variant="caption" color={colors.textFaint}>
          {deleting ? 'Deleting…' : 'Delete account'}
        </Text>
      </Pressable>
      {isDemo ? (
        <Text variant="caption" color={colors.textFaint} align="center">
          Demo mode — sample data only
        </Text>
      ) : null}

      <Sheet visible={plus} onClose={() => setPlus(false)} title="Evenly Plus">
        <View style={{ paddingHorizontal: spacing.screen, gap: 14 }}>
          {['Export to CSV and PDF', 'Currency conversion'].map((f) => (
            <View key={f} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <Icon name="check" size={18} color={colors.positive} />
              <Text variant="bodyLg">{f}</Text>
            </View>
          ))}
          <Text variant="secondary" color={colors.textMuted}>
            Evenly Plus is coming soon. Everything you need to split and settle stays free.
          </Text>
          <Button label="Got it" onPress={() => setPlus(false)} />
        </View>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  plus: {
    backgroundColor: colors.forestCard,
    borderRadius: radii.cardXl,
    paddingVertical: 16,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  logout: {
    height: 50,
    borderRadius: 16,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
});
