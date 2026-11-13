import * as Crypto from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { errorMessage, type PaymentMethod } from '@/api';
import {
  Avatar,
  Button,
  Card,
  Chip,
  DateSheet,
  Header,
  Icon,
  InfoNote,
  Pressable,
  Screen,
  Text,
  toast,
} from '@/components';
import { currencySymbol, formatMoney, minorToDecimalString, parseMinor } from '@/domain/money';
import { PAYMENT_METHOD_LABELS } from '@/features/expenses/categories';
import { usePeople } from '@/features/people';
import { usePreferences } from '@/hooks/usePreferences';
import { t } from '@/i18n';
import { formatDate, todayISO } from '@/lib/dates';
import { track } from '@/lib/monitoring';
import { useGroup, useRecordSettlement } from '@/queries';
import { colors, fontFamily, radii, typography } from '@/theme';

const METHODS: PaymentMethod[] = ['cash', 'bank_transfer', 'card', 'other'];

/** 20 — Record payment (modal). Records a payment made outside Evenly. */
export default function RecordPayment() {
  const params = useLocalSearchParams<{
    groupId: string;
    from: string;
    to: string;
    amount: string;
    currency: string;
  }>();
  const people = usePeople();
  const { locale, dateFormat } = usePreferences();
  const { group } = useGroup(params.groupId);
  const record = useRecordSettlement();
  const clientId = useRef(Crypto.randomUUID()).current; // idempotency key for this attempt

  const fullAmount = Number(params.amount) || 0;
  const [from, setFrom] = useState(params.from);
  const [to, setTo] = useState(params.to);
  const [amountText, setAmountText] = useState(minorToDecimalString(fullAmount, params.currency));
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [reference, setReference] = useState('');
  const [date, setDate] = useState(todayISO());
  const [dateOpen, setDateOpen] = useState(false);

  const amount = parseMinor(amountText, params.currency) ?? 0;
  const fromP = people.get(from);
  const toP = people.get(to);
  const iAmPayer = from === people.myId;
  const label = formatMoney(amount, params.currency, { locale });

  const submit = async () => {
    if (amount <= 0) return toast.error(t('Enter an amount greater than zero'));
    try {
      const id = await record.mutateAsync({
        groupId: params.groupId,
        clientId,
        from,
        to,
        amount,
        currency: params.currency,
        method,
        reference: reference.trim() || null,
        date,
        note: null,
      });
      track('settlement_recorded', { method });
      router.replace({ pathname: '/record-payment/success', params: { id, groupId: params.groupId } });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Screen
      gap={18}
      footer={<Button label={`Record ${label}`} onPress={submit} loading={record.isPending} disabled={amount <= 0} />}
    >
      <Header title={t('Record payment')} left="close" />

      <View style={styles.parties}>
        <Party
          id={from}
          name={from === people.myId ? 'You' : fromP.firstName}
          uri={fromP.avatarUrl}
          fullName={fromP.name}
        />
        <Pressable
          onPress={() => {
            setFrom(to);
            setTo(from);
          }}
          accessibilityLabel="Swap who paid"
          style={styles.arrow}
          hitSlop={8}
        >
          <Text variant="micro" color={colors.textFaint}>
            paid
          </Text>
          <Icon name="arrow-right" size={22} color={colors.positive} />
        </Pressable>
        <Party id={to} name={to === people.myId ? 'You' : toP.firstName} uri={toP.avatarUrl} fullName={toP.name} />
      </View>

      <View style={{ alignItems: 'center', gap: 6 }}>
        <View style={styles.amountRow}>
          <Text style={[typography.h2, { fontFamily: fontFamily.medium, fontSize: 26 }]} color={colors.textFaint}>
            {currencySymbol(params.currency, locale)}
          </Text>
          <TextInput
            value={amountText}
            onChangeText={(t) => setAmountText(t.replace(/[^0-9.,]/g, '').replace(',', '.'))}
            keyboardType="decimal-pad"
            accessibilityLabel="Amount"
            selectionColor={colors.positive}
            style={[typography.displaySm, styles.amountInput, { color: colors.ink }]}
            maxLength={14}
          />
        </View>
        <Text variant="caption" color={colors.textSubtle}>
          {amount === fullAmount ? 'Full balance' : amount < fullAmount ? 'Partial payment' : 'More than the balance'} ·{' '}
          {params.currency}
        </Text>
      </View>

      <View style={{ gap: 8 }}>
        <Text variant="secondary" color={colors.textMuted}>
          {t('Payment method')}
        </Text>
        <View style={styles.chips}>
          {METHODS.map((m) => (
            <Chip key={m} label={PAYMENT_METHOD_LABELS[m]} selected={method === m} onPress={() => setMethod(m)} />
          ))}
        </View>
      </View>

      <Card radius={radii.card}>
        <View style={[styles.row, styles.divider]}>
          <Text variant="body" color={colors.textMuted}>
            {t('Reference')}
          </Text>
          <TextInput
            value={reference}
            onChangeText={setReference}
            placeholder={t('Optional')}
            placeholderTextColor={colors.textFaint}
            maxLength={64}
            accessibilityLabel="Reference"
            style={styles.refInput}
            autoCapitalize="characters"
          />
        </View>
        <Pressable
          onPress={() => setDateOpen(true)}
          scaleOnPress={false}
          style={[styles.row, styles.divider]}
          accessibilityLabel={`Date ${formatDate(date, dateFormat)}`}
        >
          <Text variant="body" color={colors.textMuted}>
            {t('Date')}
          </Text>
          <Text variant="bodyMedium">{formatDate(date, dateFormat)}</Text>
        </Pressable>
        <View style={styles.row}>
          <Text variant="body" color={colors.textMuted}>
            {t('Group')}
          </Text>
          <Text variant="bodyMedium">{group?.name ?? '—'}</Text>
        </View>
      </Card>

      <InfoNote tone="plain">
        {iAmPayer
          ? `Evenly records payments made outside the app — no money moves here. ${toP.firstName} will be asked to confirm.`
          : `Evenly records payments made outside the app — no money moves here. Recording a payment you received confirms it straight away.`}
      </InfoNote>

      <DateSheet visible={dateOpen} onClose={() => setDateOpen(false)} value={date} onChange={setDate} />
    </Screen>
  );
}

function Party({ id, name, uri, fullName }: { id: string; name: string; uri: string | null; fullName: string }) {
  return (
    <View style={{ alignItems: 'center', gap: 6 }}>
      <Avatar id={id} name={fullName} uri={uri} size={60} />
      <Text variant="secondaryMedium">{name}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  parties: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, paddingTop: 8 },
  arrow: { alignItems: 'center', gap: 2, marginBottom: 22, minWidth: 44, minHeight: 44, justifyContent: 'center' },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  amountInput: { minWidth: 100, textAlign: 'center', padding: 0 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 52,
  },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  refInput: {
    flex: 1,
    textAlign: 'right',
    fontFamily: fontFamily.medium,
    fontSize: 14,
    color: colors.text,
    padding: 0,
    marginLeft: 16,
  },
});
