import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import {
  AmountText,
  Avatar,
  Button,
  Card,
  Header,
  Icon,
  IconButton,
  Overline,
  Pressable,
  Screen,
  Text,
} from '@/components';
import { currencySymbol, evaluateItemized, minorToDecimalString } from '@/domain/money';
import { usePeople } from '@/features/people';
import { usePreferences } from '@/hooks/usePreferences';
import { parseDraftItems, useExpenseDraft, type DraftItem } from '@/stores/drafts';
import { colors, fontFamily, radii } from '@/theme';

let nextId = 1;
const newItem = (memberIds: string[]): DraftItem => ({ id: `new-${nextId++}`, name: '', amountText: '', memberIds });
const cleanAmount = (t: string) => t.replace(/[^0-9.,]/g, '').replace(',', '.');

/** Split by item: who had what, with tax and tip shared in proportion. */
export default function Items() {
  const initial = useExpenseDraft.getState();
  const { memberIds, currency, description } = initial;
  const people = usePeople();
  const { locale } = usePreferences();
  const [items, setItems] = useState<DraftItem[]>(() =>
    initial.items.length ? initial.items : [newItem(initial.memberIds)],
  );
  const [extraText, setExtraText] = useState(initial.extraText);
  const symbol = currencySymbol(currency, locale);

  const patchItem = (id: string, p: Partial<DraftItem>) =>
    setItems((list) => list.map((it) => (it.id === id ? { ...it, ...p } : it)));
  const toggleMember = (item: DraftItem, id: string) =>
    patchItem(item.id, {
      memberIds: item.memberIds.includes(id) ? item.memberIds.filter((m) => m !== id) : [...item.memberIds, id],
    });
  const everyone = (item: DraftItem) =>
    patchItem(item.id, { memberIds: item.memberIds.length === memberIds.length ? [] : [...memberIds] });

  const parsed = parseDraftItems({ ...initial, items, extraText });
  const result = 'error' in parsed ? null : evaluateItemized(parsed.items, parsed.extra, memberIds);
  const ok = !!result && result.ok;
  const message = 'error' in parsed ? parsed.error : result && !result.ok ? result.message : null;
  const itemsTotal = 'error' in parsed ? 0 : parsed.items.reduce((s, it) => s + it.amount, 0);
  const extra = 'error' in parsed ? 0 : parsed.extra;

  const done = () => {
    if (!ok || !result) return;
    useExpenseDraft.getState().patch({
      itemized: true,
      items,
      extraText,
      amountText: minorToDecimalString(result.allocated, currency),
    });
    router.back();
  };

  return (
    <Screen
      gap={14}
      footer={
        <Button
          label="Done"
          onPress={done}
          disabled={!ok}
          accessibilityHint={ok ? undefined : (message ?? undefined)}
        />
      }
    >
      <Header title="Split by item" subtitle={description || undefined} />
      <Text variant="secondary" color={colors.textMuted}>
        Add each item and choose who had it. Items shared by several people are split equally.
      </Text>

      {items.map((item, n) => (
        <Card key={item.id} padded radius={radii.card} style={{ gap: 12 }}>
          <View style={styles.row}>
            <TextInput
              value={item.name}
              onChangeText={(name) => patchItem(item.id, { name })}
              placeholder={`Item ${n + 1}`}
              placeholderTextColor={colors.textFaint}
              accessibilityLabel={`Name of item ${n + 1}`}
              maxLength={80}
              style={[styles.input, { flex: 1 }]}
            />
            <View style={[styles.input, styles.amount]}>
              <Text variant="bodyLgStrong" color={colors.textFaint}>
                {symbol}
              </Text>
              <TextInput
                value={item.amountText}
                onChangeText={(t) => patchItem(item.id, { amountText: cleanAmount(t) })}
                placeholder="0.00"
                placeholderTextColor={colors.textFaint}
                keyboardType="decimal-pad"
                accessibilityLabel={`Amount of item ${n + 1}`}
                selectTextOnFocus
                maxLength={12}
                style={styles.amountText}
              />
            </View>
            {items.length > 1 ? (
              <IconButton
                icon="x"
                tone="plain"
                iconSize={18}
                label={`Remove item ${n + 1}`}
                onPress={() => setItems((list) => list.filter((it) => it.id !== item.id))}
              />
            ) : null}
          </View>

          <View style={{ gap: 8 }}>
            <Text variant="caption" color={colors.textSubtle}>
              Who had this?
            </Text>
            <View style={styles.chips}>
              <Pressable
                onPress={() => everyone(item)}
                accessibilityRole="button"
                accessibilityLabel={
                  item.memberIds.length === memberIds.length
                    ? `Clear everyone from item ${n + 1}`
                    : `Everyone had item ${n + 1}`
                }
                scaleOnPress={false}
                style={[styles.chip, { backgroundColor: colors.surfaceMuted }]}
              >
                <Icon name="users" size={14} color={colors.forest} />
                <Text variant="captionStrong" color={colors.forest}>
                  {item.memberIds.length === memberIds.length ? 'Clear' : 'Everyone'}
                </Text>
              </Pressable>
              {memberIds.map((id) => {
                const on = item.memberIds.includes(id);
                const p = people.get(id);
                return (
                  <Pressable
                    key={id}
                    onPress={() => toggleMember(item, id)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={`${people.label(id)} had item ${n + 1}`}
                    scaleOnPress={false}
                    style={[styles.chip, on ? styles.chipOn : styles.chipOff]}
                  >
                    <Avatar id={id} name={p.name} uri={p.avatarUrl} size={22} />
                    <Text variant="captionStrong" color={on ? colors.onDarkStrong : colors.ink}>
                      {people.label(id)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Card>
      ))}

      <Button
        label="Add item"
        icon="plus"
        variant="muted"
        size="md"
        onPress={() => setItems((list) => [...list, newItem(memberIds)])}
      />

      <Card padded radius={radii.card} style={{ gap: 12 }}>
        <View style={styles.totalRow}>
          <Text variant="body" color={colors.textMuted}>
            Items
          </Text>
          <AmountText minor={itemsTotal} currency={currency} variant="bodyMedium" />
        </View>
        <View style={styles.totalRow}>
          <View style={{ flex: 1 }}>
            <Text variant="body" color={colors.textMuted}>
              Tax & tip
            </Text>
            <Text variant="caption" color={colors.textFaint}>
              Shared in proportion to each person’s items
            </Text>
          </View>
          <View style={[styles.input, styles.amount]}>
            <Text variant="bodyLgStrong" color={colors.textFaint}>
              {symbol}
            </Text>
            <TextInput
              value={extraText}
              onChangeText={(t) => setExtraText(cleanAmount(t))}
              placeholder="0.00"
              placeholderTextColor={colors.textFaint}
              keyboardType="decimal-pad"
              accessibilityLabel="Tax and tip"
              selectTextOnFocus
              maxLength={12}
              style={styles.amountText}
            />
          </View>
        </View>
        <View style={[styles.totalRow, styles.totalLine]}>
          <Text variant="bodyStrong">Total</Text>
          <AmountText minor={itemsTotal + extra} currency={currency} variant="bodyLgStrong" />
        </View>
      </Card>

      {message ? (
        <Text variant="secondaryStrong" color={colors.negative} accessibilityLiveRegion="polite">
          {message}
        </Text>
      ) : null}

      {ok && result ? (
        <View style={{ gap: 8 }}>
          <Overline>WHO OWES WHAT</Overline>
          <Card radius={radii.card}>
            {result.allocations.map((a, i, arr) => {
              const p = people.get(a.id);
              return (
                <View key={a.id} style={[styles.person, i < arr.length - 1 && styles.divider]}>
                  <Avatar id={a.id} name={p.name} uri={p.avatarUrl} size={32} />
                  <Text variant="bodyMedium" style={{ flex: 1 }}>
                    {people.label(a.id)}
                  </Text>
                  <AmountText minor={a.amount} currency={currency} variant="bodyStrong" />
                </View>
              );
            })}
          </Card>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    minHeight: 44,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    backgroundColor: colors.surfaceMuted,
    fontFamily: fontFamily.medium,
    fontSize: 15,
    color: colors.ink,
  },
  amount: { width: 118, flexDirection: 'row', alignItems: 'center', gap: 4 },
  amountText: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: 15,
    color: colors.ink,
    textAlign: 'right',
    padding: 0,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  chipOn: { backgroundColor: colors.forest },
  chipOff: { backgroundColor: colors.surface, borderColor: colors.borderStrong },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  totalLine: { borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: 12 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
});
