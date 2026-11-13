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
  Pill,
  Pressable,
  ProgressBar,
  Screen,
  Text,
  toast,
} from '@/components';
import { currencySymbol, formatBp, formatMoney, FULL_PERCENT_BP } from '@/domain/money';
import { SPLIT_MODES, splitModeMeta } from '@/features/expenses/split-summary';
import { usePeople } from '@/features/people';
import { openPricing, useIsPro } from '@/features/plan';
import { usePreferences } from '@/hooks/usePreferences';
import { errorMessage } from '@/api';
import { t } from '@/i18n';
import { useGroup, useGroupSplitDefault, useSaveSplitDefault } from '@/queries';
import { draftAmount, draftAsDefault, draftRows, evaluateDraft, sameDefault, useExpenseDraft } from '@/stores/drafts';
import { colors, fontFamily, radii } from '@/theme';

/** 16 / 16b — Split expense: five modes with live validation. */
export default function Split() {
  const d = useExpenseDraft();
  const isPro = useIsPro();
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
        label: d.method === 'percent' ? t('100% allocated') : t('Fully allocated'),
        detail: t('{done} of {total}', { done: fmt(amount), total: fmt(amount) }),
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
          ? t('{amount} left to assign', { amount: fmt(evaluation.remaining) })
          : t('{amount} over the total', { amount: fmt(-evaluation.remaining) });
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

  // "Save as default": only for splits that don't depend on this bill's total.
  const { group } = useGroup(d.groupId);
  const saved = useGroupSplitDefault(d.expenseId ? null : d.groupId);
  const saveDefault = useSaveSplitDefault();
  const current = evaluation.ok && !d.expenseId ? draftAsDefault(d) : null;
  const isSaved = !!current && sameDefault(current, saved.data);
  const changeDefault = (value: typeof current) =>
    saveDefault.mutate(
      { groupId: d.groupId!, value },
      {
        onSuccess: () => toast.success(value ? t('Saved as your default split') : t('Default split cleared')),
        onError: (e) => toast.error(errorMessage(e)),
      },
    );

  if (d.itemized) {
    return (
      <Screen gap={18} footer={<Button label={t('Done')} onPress={() => router.back()} disabled={!evaluation.ok} />}>
        <Header title={`Split ${fmt(amount)}`} subtitle={t('By item')} />
        <Card>
          {evaluation.allocations.map((a, i, arr) => {
            const p = people.get(a.id);
            return (
              <View key={a.id} style={[styles.row, i < arr.length - 1 && styles.divider]}>
                <Avatar id={a.id} name={p.name} uri={p.avatarUrl} size={36} />
                <Text variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
                  {people.label(a.id)}
                </Text>
                <AmountText minor={a.amount} currency={d.currency} variant="bodyStrong" />
              </View>
            );
          })}
        </Card>
        {evaluation.ok ? null : (
          <Text variant="secondaryStrong" color={colors.negative}>
            {evaluation.message}
          </Text>
        )}
        <Button
          label={t('Edit items')}
          icon="pencil"
          variant="muted"
          size="md"
          onPress={() => router.push('/add-expense/items')}
        />
        <Button
          label={t('Use a regular split instead')}
          variant="outline"
          size="md"
          onPress={() => d.patch({ itemized: false })}
          accessibilityHint="Keeps the total and lets you split it equally, by percent or by shares"
        />
      </Screen>
    );
  }

  return (
    <Screen
      gap={18}
      footer={
        <Button
          label={t('Done')}
          onPress={() => router.back()}
          disabled={!evaluation.ok}
          accessibilityHint={evaluation.ok ? undefined : t('The split must add up first')}
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
              accessibilityLabel={`Split ${t(m.label)}`}
              style={[styles.mode, { backgroundColor: on ? colors.forest : colors.surface }]}
            >
              <Icon name={m.icon} size={18} color={on ? colors.onDarkStrong : colors.ink} />
              <Text
                variant="micro"
                color={on ? colors.onDarkStrong : colors.ink}
                style={{ fontFamily: fontFamily.medium }}
              >
                {t(m.label)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text variant="secondary" color={colors.textMuted}>
        {t(meta.help)}
      </Text>

      <Pressable
        onPress={() => (isPro ? router.push('/add-expense/items') : openPricing('items'))}
        accessibilityRole="button"
        accessibilityLabel="Split by item"
        accessibilityHint="Add each item from the bill and choose who had it"
        style={styles.byItem}
      >
        <Icon name="receipt" size={18} color={colors.forest} />
        <View style={{ flex: 1, gap: 1 }}>
          <Text variant="bodyMedium">{t('Split by item')}</Text>
          <Text variant="caption" color={colors.textSubtle}>
            {t('Everyone pays for what they had, tax and tip shared fairly')}
          </Text>
        </View>
        {isPro ? null : <Pill label={t('Pro')} tone="positive" variant="soft" />}
        <Icon name="chevron-right" size={18} color={colors.textFaint} />
      </Pressable>

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
                      {included ? '—' : t('Not included')}
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

      {current && d.groupId ? (
        <View style={styles.defaultRow}>
          {isSaved ? (
            <>
              <Icon name="circle-check" size={18} color={colors.positive} />
              <Text variant="secondary" color={colors.textMuted} style={{ flex: 1 }}>
                {t('Your default split for {group}', { group: group?.name ?? t('this group') })}
              </Text>
              <Pressable
                onPress={() => changeDefault(null)}
                accessibilityRole="button"
                accessibilityLabel="Clear your default split for this group"
                hitSlop={10}
              >
                <Text variant="captionStrong" color={colors.negative}>
                  {t('Clear')}
                </Text>
              </Pressable>
            </>
          ) : (
            <Button
              label={t('Save as my default for this group')}
              icon="check"
              size="md"
              variant="muted"
              loading={saveDefault.isPending}
              onPress={() => changeDefault(current)}
              accessibilityHint="New expenses in this group will start with this split"
            />
          )}
        </View>
      ) : null}

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
  defaultRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  byItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
  },
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
