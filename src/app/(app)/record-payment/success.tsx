import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AmountText, Button, Card, Icon, Pressable, RadialFill, Screen, Skeleton, Text } from '@/components';
import { remainingOwed } from '@/domain/ledger';
import { formatMoney } from '@/domain/money';
import { PAYMENT_METHOD_LABELS } from '@/features/expenses/categories';
import { usePeople } from '@/features/people';
import { usePreferences } from '@/hooks/usePreferences';
import { useBalances, useSettlement } from '@/queries';
import { colors, radii } from '@/theme';

/** 21 — Payment recorded */
export default function PaymentRecorded() {
  const { id, groupId } = useLocalSearchParams<{ id: string; groupId: string }>();
  const s = useSettlement(id);
  const balances = useBalances();
  const people = usePeople();
  const { locale } = usePreferences();

  const done = () => router.dismissAll();
  const st = s.data;
  const iPaid = st?.from === people.myId;
  const other = st ? people.get(iPaid ? st.to : st.from) : null;
  const still = st ? remainingOwed(balances.data ?? [], groupId, st.currency, st.from, st.to) : 0;

  return (
    <View style={{ flex: 1 }}>
      <RadialFill colors={colors.successGlow} offsets={[0, 0.7]} cy="25%" rx="110%" ry="60%" />
      <Screen
        bg="transparent"
        padding={24}
        footer={
          <View style={{ gap: 14, alignItems: 'center' }}>
            <Button label="Done" onPress={done} />
            <Pressable
              onPress={() => {
                router.dismissAll();
                router.push('/activity');
              }}
              accessibilityRole="link"
              scaleOnPress={false}
              hitSlop={10}
            >
              <Text variant="bodyMedium" color={colors.positive}>
                View in activity
              </Text>
            </Pressable>
          </View>
        }
      >
        <View style={styles.body}>
          <View style={styles.ring}>
            <View style={styles.check}>
              <Icon name="check" size={40} color={colors.onDarkStrong} strokeWidth={2.5} />
            </View>
          </View>
          {!st || !other ? (
            <Skeleton width={220} height={28} />
          ) : (
            <>
              <View style={{ gap: 8 }}>
                <Text variant="h2" align="center" accessibilityRole="header">
                  Payment recorded
                </Text>
                <Text variant="bodyLg" color={colors.textMuted} align="center">
                  {iPaid ? `You paid ${other.firstName} ` : `${other.firstName} paid you `}
                  <Text variant="bodyLgStrong">{formatMoney(st.amount, st.currency, { locale })}</Text>.{'\n'}
                  {st.status === 'pending' ? `We’ve let ${other.firstName} know.` : 'Balances are updated.'}
                </Text>
              </View>
              <Card style={styles.summary}>
                <Line label="Method" value={PAYMENT_METHOD_LABELS[st.method]} />
                {st.reference ? <Line label="Reference" value={st.reference} /> : null}
                <Line
                  label="Status"
                  value={st.status === 'pending' ? 'Awaiting confirmation' : 'Confirmed'}
                  color={st.status === 'pending' ? colors.warning : colors.positive}
                  strong
                />
                <View style={[styles.line, { borderBottomWidth: 0 }]}>
                  <Text variant="body" color={colors.textMuted}>
                    {iPaid ? 'You still owe' : `${other.firstName} still owes`}
                  </Text>
                  <AmountText
                    minor={still}
                    currency={st.currency}
                    tone={still > 0 ? (iPaid ? 'negative' : 'positive') : 'neutral'}
                  />
                </View>
              </Card>
            </>
          )}
        </View>
      </Screen>
    </View>
  );
}

function Line({ label, value, color, strong }: { label: string; value: string; color?: string; strong?: boolean }) {
  return (
    <View style={styles.line}>
      <Text variant="body" color={colors.textMuted}>
        {label}
      </Text>
      <Text variant={strong ? 'bodyStrong' : 'bodyMedium'} color={color}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', gap: 20, paddingTop: 60 },
  ring: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: colors.positiveRing,
    alignItems: 'center',
    justifyContent: 'center',
  },
  check: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.positive,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summary: {
    alignSelf: 'stretch',
    paddingVertical: 6,
    paddingHorizontal: 16,
    marginTop: 10,
    borderRadius: radii.cardLg,
  },
  line: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
});
