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
  SelectSheet,
  Text,
  toast,
} from '@/components';
import { openPricing } from '@/features/plan';
import { LANGUAGES, t, useLanguage, type LanguageCode } from '@/i18n';
import { authClient } from '@/lib/auth';
import { config, isDemo } from '@/lib/config';
import { forgetLocalData, signOut } from '@/lib/session';
import { usePlan } from '@/queries';
import { useSession } from '@/stores/session';
import { colors, radii } from '@/theme';

/** 23 — Profile & settings */
export default function Profile() {
  const me = useSession((s) => s.me!);
  const plan = usePlan().data;
  const [deleting, setDeleting] = useState(false);
  const [languageSheet, setLanguageSheet] = useState(false);
  const language = useLanguage((s) => s.code);
  const changeLanguage = async (code: LanguageCode) => {
    const reopen = await useLanguage.getState().set(code);
    if (reopen) {
      alert(t('Reopen Evenly'), t('Close Evenly and open it again to switch the layout direction for this language.'));
    }
  };
  const p = me.profile;
  const prefs = me.preferences;

  const logOut = () =>
    alert(t('Log out of Evenly?'), undefined, [
      { text: t('Cancel'), style: 'cancel' },
      { text: t('Log out'), style: 'destructive', onPress: () => void signOut() },
    ]);

  const deleteAccount = () =>
    alert(
      t('Delete your account?'),
      t('Your profile is removed and you leave all groups. Expenses other people rely on stay in their history as “Deleted user”. You must be settled up first. This can’t be undone.'),
      [
        { text: t('Cancel'), style: 'cancel' },
        {
          text: t('Delete account'),
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await api.deleteAccount();
              await forgetLocalData(p.id);
              await authClient.deleteUser().catch(() => authClient.signOut());
              toast.success(t('Your account was deleted'));
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
      title: t('ACCOUNT'),
      items: [
        { icon: 'user', label: t('Personal info'), value: '', onPress: () => router.push('/settings/personal') },
        {
          icon: 'link',
          label: t('Sign-in method'),
          value: 'Google',
          onPress: () =>
            alert(
              t('Sign-in method'),
              p.email
                ? t('You sign in with Google ({email}). Evenly never stores a password.', { email: p.email })
                : t('You sign in with Google. Evenly never stores a password.'),
            ),
        },
        {
          icon: 'banknote',
          label: t('Currency & region'),
          value: `${p.defaultCurrency} · ${prefs.region}`,
          onPress: () => router.push('/settings/region'),
        },
        {
          icon: 'bell',
          label: t('Notifications'),
          value: prefs.notifyPush ? t('On') : t('Off'),
          onPress: () => router.push('/settings/notifications'),
        },
      ],
    },
    {
      title: t('APP'),
      items: [
        {
          icon: 'globe',
          label: t('Language'),
          value: LANGUAGES.find((l) => l.code === language)?.name ?? 'English',
          onPress: () => setLanguageSheet(true),
        },
        { icon: 'chart-pie', label: t('Reports'), value: '', onPress: () => router.push('/reports') },
        {
          icon: 'moon',
          label: t('Appearance'),
          value: t('Light'),
          onPress: () => alert(t('Appearance'), t('Dark mode is on its way. Evenly uses the light theme for now.')),
        },
        {
          icon: 'circle-help',
          label: t('Help & support'),
          value: '',
          onPress: () => Linking.openURL(`mailto:${config.supportEmail}?subject=Evenly%20support`),
        },
        { icon: 'shield', label: t('Privacy & terms'), value: '', onPress: () => router.push('/settings/legal') },
      ],
    },
  ];

  return (
    <Screen gap={16}>
      <Header title={t('Profile')} />

      <View style={styles.identity}>
        <Avatar id={p.id} name={p.fullName} uri={p.avatarUrl} size={64} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="nav" style={{ fontSize: 19 }} numberOfLines={1}>
            {p.fullName}
          </Text>
          <Text variant="secondary" color={colors.textSubtle} numberOfLines={1}>
            {p.email ?? t('Signed in with Google')}
          </Text>
        </View>
        <Button
          label={t('Edit')}
          size="sm"
          variant="secondary"
          fullWidth={false}
          style={{ height: 36 }}
          onPress={() => router.push('/settings/personal')}
        />
      </View>

      <Pressable onPress={() => openPricing()} accessibilityLabel={t('Evenly Pro')} style={styles.plus}>
        <IconTile icon="crown" size={44} radius={14} bg={colors.mint} fg={colors.forest} iconSize={20} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="bodyLgStrong" color={colors.onDark}>
            {t('Evenly Pro')}
          </Text>
          <Text variant="caption" color={colors.onDarkMuted}>
            {!plan
              ? ' '
              : plan.plan === 'pro'
                ? t('You’re on Pro')
                : t('Free plan · {used} of {limit} expenses this month', {
                    used: Math.min(plan.expensesUsed, plan.expenseLimit),
                    limit: plan.expenseLimit,
                  })}
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

      <Pressable onPress={logOut} accessibilityLabel={t('Log out')} style={styles.logout}>
        <Icon name="log-out" size={18} color={colors.negative} />
        <Text variant="bodyStrong" color={colors.negative}>
          {t('Log out')}
        </Text>
      </Pressable>

      <Pressable
        onPress={deleteAccount}
        disabled={deleting}
        accessibilityRole="button"
        accessibilityLabel={t('Delete account')}
        scaleOnPress={false}
        style={{ alignSelf: 'center', padding: 8 }}
      >
        <Text variant="caption" color={colors.textFaint}>
          {deleting ? t('Deleting…') : t('Delete account')}
        </Text>
      </Pressable>
      {isDemo ? (
        <Text variant="caption" color={colors.textFaint} align="center">
          {t('Demo mode — sample data only')}
        </Text>
      ) : null}

      <SelectSheet
        visible={languageSheet}
        onClose={() => setLanguageSheet(false)}
        title={t('Language')}
        options={LANGUAGES.map((l) => ({ value: l.code, label: l.name }))}
        value={language}
        onSelect={(code) => void changeLanguage(code)}
      />
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
