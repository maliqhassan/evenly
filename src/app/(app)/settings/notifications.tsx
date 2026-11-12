import { StyleSheet, Switch, View } from 'react-native';

import { errorMessage, type Preferences } from '@/api';
import { Card, Header, InfoNote, Screen, Text, toast } from '@/components';
import { registerForPush } from '@/lib/push';
import { useUpdatePreferences } from '@/queries';
import { useSession } from '@/stores/session';
import { colors } from '@/theme';

type Key = 'notifyPush' | 'notifyExpenses' | 'notifySettlements' | 'notifyInvites' | 'notifyReminders';

const ROWS: { key: Key; title: string; body: string }[] = [
  { key: 'notifyExpenses', title: 'Expenses', body: 'When someone adds, edits or deletes an expense you’re in' },
  { key: 'notifySettlements', title: 'Payments', body: 'When someone records or confirms a payment with you' },
  { key: 'notifyInvites', title: 'Groups & invites', body: 'Invitations and new members' },
  { key: 'notifyReminders', title: 'Reminders', body: 'Nudges from friends to settle up' },
];

/** Notification preferences (FR-082). Push delivery honours these server-side. */
export default function NotificationSettings() {
  const prefs = useSession((s) => s.me!.preferences);
  const update = useUpdatePreferences();
  const set = (key: Key, value: boolean) => {
    update.mutate({ [key]: value } as Partial<Preferences>, { onError: (e) => toast.error(errorMessage(e)) });
    if (key === 'notifyPush' && value) void registerForPush({ fromSettings: true });
  };

  return (
    <Screen>
      <Header title="Notifications" />
      <Card>
        <Row
          title="Push notifications"
          body="Get alerts on this device"
          value={prefs.notifyPush}
          onChange={(v) => set('notifyPush', v)}
          last
        />
      </Card>
      <Card style={{ opacity: prefs.notifyPush ? 1 : 0.5 }}>
        {ROWS.map((r, i) => (
          <Row
            key={r.key}
            title={r.title}
            body={r.body}
            value={prefs[r.key]}
            disabled={!prefs.notifyPush}
            onChange={(v) => set(r.key, v)}
            last={i === ROWS.length - 1}
          />
        ))}
      </Card>
      <InfoNote>You’ll always see everything in the in-app notification list, even with push turned off.</InfoNote>
    </Screen>
  );
}

function Row({
  title,
  body,
  value,
  onChange,
  disabled,
  last,
}: {
  title: string;
  body: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  last?: boolean;
}) {
  return (
    <View style={[styles.row, !last && styles.divider]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyMedium">{title}</Text>
        <Text variant="caption" color={colors.textSubtle}>
          {body}
        </Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        accessibilityLabel={title}
        trackColor={{ true: colors.positive, false: colors.surfaceMuted2 }}
        thumbColor={colors.surface}
        ios_backgroundColor={colors.surfaceMuted2}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 60,
  },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
});
