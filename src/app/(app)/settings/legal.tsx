import * as Application from 'expo-application';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { Card, Header, IconTile, ListRow, Screen, Text } from '@/components';
import { t } from '@/i18n';
import { config } from '@/lib/config';
import { colors } from '@/theme';

/** Privacy, terms and support (FR-012, FR-088). */
export default function Legal() {
  const rows = [
    { icon: 'shield', label: 'Privacy policy', onPress: () => WebBrowser.openBrowserAsync(config.privacyUrl) },
    { icon: 'file-text', label: 'Terms of service', onPress: () => WebBrowser.openBrowserAsync(config.termsUrl) },
    { icon: 'mail', label: 'Contact support', onPress: () => Linking.openURL(`mailto:${config.supportEmail}`) },
  ];
  return (
    <Screen>
      <Header title={t('Privacy & terms')} />
      <Card>
        {rows.map((r, i) => (
          <ListRow
            key={r.label}
            title={r.label}
            left={<IconTile icon={r.icon} size={32} radius={9} iconSize={16} fg={colors.ink} />}
            chevron
            divider={i < rows.length - 1}
            onPress={r.onPress}
          />
        ))}
      </Card>
      <Text variant="secondary" color={colors.textMuted}>
        {t(
          'Evenly stores your name, email, profile photo and the expenses you share so your groups can see who owes whom. Evenly records payments you make elsewhere — it never moves money. Analytics never include amounts or descriptions. You can delete your account from your profile at any time.',
        )}
      </Text>
      <Text variant="caption" color={colors.textFaint} align="center">
        Evenly {Application.nativeApplicationVersion ?? '1.0.0'} ({Application.nativeBuildVersion ?? 'dev'})
      </Text>
    </Screen>
  );
}
