import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import {
  AmountText,
  Avatar,
  Button,
  Card,
  Checkbox,
  Header,
  Icon,
  Pressable,
  ProgressBar,
  Screen,
  Text,
} from '@/components';
import { currencySymbol, formatBp, formatMoney, FULL_PERCENT_BP } from '@/domain/money';
import { SPLIT_MODES, splitModeMeta } from '@/features/expenses/split-summary';
import { usePeople } from '@/features/people';
import { usePreferences } from '@/hooks/usePreferences';
import { draftAmount, draftRows, evaluateDraft, useExpenseDraft } from '@/stores/drafts';
import { colors, fontFamily, radii } from '@/theme';

/** 16 / 16b — Split expense: five modes with live validation. */
export default function Split() {
  const d = useExpenseDraft();
  const people = usePeople();
  const { locale } = usePreferences();
  const amount = draftAmount(d);
  const evaluation = useMemo(() => evaluateDraft(d), [d]);
  const rows = draftRows(d);
  const allocById = new Map(evaluation.allocations.map((a) => [a.id, a.amount]));
  const fmt = (m: number) => formatMoney(m, d.currency, { locale });

  const status = (() => {
    if (evaluation.ok) {
      return {
        ok: true,
        label: d.method === 'percent' ? '100% allocated' : 'Fully allocated',
        detail: `${fmt(amount)} of ${fmt(amount)}`,
        progress: 1,
      };
    }
    const allocated = evaluation.allocated;
    if (
      evaluation.reason === 'zero_total' ||
      evaluation.reason === 'no_participants' ||
      evaluation.reason === 'invalid'
    ) {
      return { ok: false, label: evaluation.message, detail: '', progress: 0 };
    }
    const label =
      d.method === 'percent' && evaluation.remainingBp !== undefined
        ? evaluation.message
        : evaluation.remaining > 0
          ? `${fmt(evaluation.remaining)} left to assign`
          : `${fmt(-evaluation.remaining)} over the total`;
    return {
      ok: false,
      label,
      detail: `${fmt(allocated)} of ${fmt(amount)}`,
      progress: amount > 0 ? Math.min(1, allocated / amount) : 0,
    };
  })();

  const suffix = d.method === 'percent' ? '%' : d.method === 'shares' ? '×' : null;
  const prefix = d.method === 'exact' || d.method === 'adjust' ? currencySymbol(d.currency, locale) : null;
  const meta = splitModeMeta(d.method);

  return (
    <Screen
      gap={18}
      footer={
        <Button
          label="Done"
          onPress={() => router.back()}
          disabled={!evaluation.ok}
          accessibilityHint={evaluation.ok ? undefined : 'The split must add up first'}
        />
      }
    >
      <Header title={`Split ${fmt(amount)}`} subtitle={d.description || undefined} />

      <View style={styles.modes} accessibilityRole="tablist">
        {SPLIT_MODES.map((m) => {
          const on = m.value === d.method;
          return (
            <Pressable
              key={m.value}
              onPress={() => d.setMethod(m.value)}
              haptic
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`Split ${m.label}`}
              style={[styles.mode, { backgroundColor: on ? colors.forest : colors.surface }]}
            >
              <Icon name={m.icon} size={18} color={on ? colors.onDarkStrong : colors.ink} />
              <Text
                variant="micro"
                color={on ? colors.onDarkStrong : colors.ink}
                style={{ fontFamily: fontFamily.medium }}
              >
                {m.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text variant="secondary" color={colors.textMuted}>
        {meta.help}
      </Text>

      <Card>
        {d.memberIds.map((id, i) => {
          const p = people.get(id);
          const included = d.method === 'exact' ? true : !!d.included[id];
          const share = allocById.get(id);
          const raw = rows.find((r) => r.id === id);
          const invalid = raw ? Number.isNaN(raw.value) : false;
          return (
            <View
              key={id}
              style={[styles.row, i < d.memberIds.length - 1 && styles.divider, !included && { opacity: 0.55 }]}
            >
              {d.method !== 'exact' ? (
                <Checkbox checked={included} onPress={() => d.toggle(id)} label={`Include ${people.label(id)}`} />
              ) : null}
              <Avatar id={id} name={p.name} uri={p.avatarUrl} size={36} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {people.label(id)}
                </Text>
                {d.method !== 'exact' ? (
                  included && share !== undefined ? (
                    <AmountText minor={share} currency={d.currency} variant="caption" color={colors.textSubtle} />
                  ) : (
                    <Text variant="caption" color={colors.textFaint}>
                      {included ? '—' : 'Not included'}
                    </Text>
                  )
                ) : null}
              </View>
              {d.method === 'equal' ? null : (
                <View
                  style={[
                    styles.input,
                    { width: d.method === 'exact' || d.method === 'adjust' ? 108 : 76 },
                    invalid && styles.inputError,
                  ]}
                >
                  {prefix ? (
                    <Text variant="bodyLgStrong" color={colors.textFaint}>
                      {d.method === 'adjust' ? `±${prefix}` : prefix}
                    </Text>
                  ) : null}
                  <TextInput
                    value={d.inputs[d.method][id] ?? ''}
                    onChangeText={(t) => d.setInput(id, t.replace(',', '.'))}
                    editable={included}
                    keyboardType={d.method === 'adjust' ? 'numbers-and-punctuation' : 'decimal-pad'}
                    selectTextOnFocus
                    accessibilityLabel={`${meta.label} for ${people.label(id)}`}
                    style={styles.inputText}
                    placeholder="0"
                    placeholderTextColor={colors.textFaint}
                  />
                  {suffix ? (
                    <Text variant="bodyLgStrong" color={colors.textFaint} style={{ marginLeft: 2 }}>
                      {suffix}
                    </Text>
                  ) : null}
                </View>
              )}
            </View>
          );
        })}
      </Card>

      <View
        style={[styles.status, { backgroundColor: status.ok ? colors.positiveSoft : colors.negativeSoft }]}
        accessibilityLiveRegion="polite"
      >
        <View style={styles.statusTop}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
            <Icon
              name={status.ok ? 'circle-check' : 'circle-alert'}
              size={16}
              color={status.ok ? colors.positive : colors.negative}
            />
            <Text variant="secondaryStrong" color={status.ok ? colors.positive : colors.negative}>
              {status.label}
            </Text>
          </View>
          {status.detail ? (
            <Text variant="secondary" color={colors.forest} tabular>
              {status.detail}
            </Text>
          ) : null}
        </View>
        <ProgressBar
          value={status.progress}
          color={status.ok ? colors.positive : colors.negative}
          track={status.ok ? colors.positive : colors.negativeTrack}
        />
        {d.method === 'percent' && !status.ok ? (
          <Pressable onPress={d.reseed} accessibilityLabel="Reset to equal percentages" scaleOnPress={false}>
            <Text variant="captionMedium" color={colors.negative}>
              Reset to{' '}
              {formatBp(Math.floor(FULL_PERCENT_BP / Math.max(1, d.memberIds.filter((x) => d.included[x]).length)))}%
              each
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  modes: { flexDirection: 'row', gap: 6 },
  mode: { flex: 1, height: 64, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  input: {
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.bg,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  inputError: { borderWidth: 1.5, borderColor: colors.negative },
  inputText: {
    flex: 1,
    textAlign: 'right',
    fontFamily: fontFamily.semibold,
    fontSize: 15,
    color: colors.ink,
    padding: 0,
    fontVariant: ['tabular-nums'],
  },
  status: { paddingVertical: 14, paddingHorizontal: 16, borderRadius: radii.card, gap: 10 },
  statusTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
});
