import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { api, errorMessage } from '@/api';
import {
  alert,
  AmountText,
  Avatar,
  Button,
  Card,
  DateSheet,
  Header,
  Icon,
  IconButton,
  IconTile,
  Pressable,
  Screen,
  SelectSheet,
  Sheet,
  Text,
  toast,
} from '@/components';
import { currencyLabel, currencySymbol, type Allocation } from '@/domain/money';
import { categoryIcon, categoryName } from '@/features/expenses/categories';
import { splitModeMeta } from '@/features/expenses/split-summary';
import { activeMembers, usePeople } from '@/features/people';
import { currencyOptions } from '@/features/profile/options';
import { usePreferences } from '@/hooks/usePreferences';
import { formatRelativeDay } from '@/lib/dates';
import { chooseImage } from '@/lib/media';
import { track } from '@/lib/monitoring';
import { useCategories, useGroupSplitDefault, useGroups, useSaveExpense } from '@/queries';
import { expenseSchema } from '@/schemas';
import { draftAmount, draftItemization, draftRows, evaluateDraft, useExpenseDraft } from '@/stores/drafts';
import { useSession } from '@/stores/session';
import { colors, fontFamily, radii, typography } from '@/theme';

type SheetName = 'group' | 'currency' | 'category' | 'date' | 'payer' | 'note' | 'repeat' | null;

const REPEAT_OPTIONS = [
  { value: 'never', label: 'Never', description: 'Just this once' },
  { value: 'weekly', label: 'Every week', description: 'Same day each week' },
  { value: 'monthly', label: 'Every month', description: 'Same date each month, such as rent' },
  { value: 'yearly', label: 'Every year', description: 'Same date each year' },
] as const;
const repeatLabel = (v: string) => REPEAT_OPTIONS.find((o) => o.value === v)?.label ?? 'Never';

/** 15 — Add expense (also used to edit, via ?expenseId=). */
export default function AddExpense() {
  const { keepDraft, expenseId } = useLocalSearchParams<{ keepDraft?: string; expenseId?: string }>();
  const myId = useSession((s) => s.me!.profile.id);
  const { locale, dateFormat } = usePreferences();
  const groups = useGroups();
  const categories = useCategories();
  const people = usePeople();
  const save = useSaveExpense();
  const d = useExpenseDraft();
  const [sheet, setSheet] = useState<SheetName>(null);
  const [touched, setTouched] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(!!expenseId);

  const activeGroups = (groups.data ?? []).filter((g) => !g.archivedAt);
  const group = (groups.data ?? []).find((g) => g.id === d.groupId);

  // Initialise the draft.
  useEffect(() => {
    if (expenseId) {
      api
        .getExpense(expenseId)
        .then((e) => {
          const g = groups.data?.find((x) => x.id === e.groupId);
          if (g) useExpenseDraft.getState().startEdit(e, g);
        })
        .catch((e) => toast.error(errorMessage(e)))
        .finally(() => setLoadingEdit(false));
    } else if (!keepDraft) {
      useExpenseDraft.getState().start({ group: activeGroups[0] ?? null, me: myId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenseId, groups.isSuccess]);

  // If groups load after the draft started, attach the first group.
  useEffect(() => {
    if (!d.groupId && activeGroups[0] && !expenseId) useExpenseDraft.getState().setGroup(activeGroups[0], myId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups.data]);

  // Start a new expense from the split the user saved for this group, once per draft and group.
  const splitDefault = useGroupSplitDefault(expenseId ? null : d.groupId);
  const defaultAppliedFor = useRef<string | null>(null);
  useEffect(() => {
    if (expenseId || !d.groupId || !splitDefault.isSuccess) return;
    const key = `${d.clientId}:${d.groupId}`;
    if (defaultAppliedFor.current === key) return;
    defaultAppliedFor.current = key;
    // Only if the user hasn't already chosen a split for this draft.
    if (splitDefault.data && d.method === 'equal') useExpenseDraft.getState().applyDefault(splitDefault.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenseId, d.groupId, d.clientId, splitDefault.isSuccess, splitDefault.data]);

  const amount = draftAmount(d);
  const evaluation = useMemo(() => evaluateDraft(d), [d]);
  const myShare = evaluation.ok ? (evaluation.allocations.find((a) => a.id === myId)?.amount ?? 0) : null;
  const participants =
    d.method === 'exact' || d.itemized
      ? evaluation.ok
        ? evaluation.allocations.filter((a) => a.amount > 0).length
        : 0
      : d.memberIds.filter((id) => d.included[id]).length;
  const meta = splitModeMeta(d.method);

  const errors = touched
    ? {
        amount: amount <= 0 ? 'Enter an amount' : null,
        description: !d.description.trim() ? 'Add a description' : null,
      }
    : { amount: null, description: null };

  const submit = async () => {
    setTouched(true);
    const parsed = expenseSchema.safeParse({
      groupId: d.groupId ?? '',
      amount,
      description: d.description,
      paidBy: d.paidBy ?? '',
      notes: d.notes,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Check the expense details');
      return;
    }
    if (!evaluation.ok) {
      toast.error('The split doesn’t add up yet');
      router.push('/add-expense/split');
      return;
    }
    const splits = buildSplits(evaluation.allocations);
    try {
      const id = await save.mutateAsync({
        input: {
          groupId: d.groupId!,
          clientId: d.clientId,
          expenseId: d.expenseId ?? undefined,
          expectedVersion: d.expectedVersion ?? undefined,
          description: d.description.trim(),
          amount,
          currency: d.currency,
          paidBy: d.paidBy!,
          splits,
          splitMethod: d.itemized ? 'exact' : d.method,
          categoryId: d.categoryId,
          date: d.date,
          notes: d.notes.trim() || null,
        },
        receipt: d.receipt,
        repeat: !d.expenseId && d.repeat !== 'never' ? d.repeat : undefined,
        // Items are saved with the expense; turning them off on an itemized expense removes them.
        itemization: d.itemized ? draftItemization(d) : d.hadItems ? null : undefined,
      });
      track('expense_saved', { method: d.method, edit: !!d.expenseId, receipt: !!d.receipt, repeat: d.repeat });
      toast.success(
        d.expenseId
          ? 'Expense updated'
          : d.repeat !== 'never'
            ? `Expense saved. It repeats ${repeatLabel(d.repeat).toLowerCase()}.`
            : 'Expense saved',
      );
      router.dismiss();
      if (!d.expenseId && !keepDraft) router.push({ pathname: '/expense/[id]', params: { id } });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  /** Server payload: exact drops zero rows; inputs are kept so the split can be re-edited. */
  const buildSplits = (allocs: Allocation[]) => {
    const raw = new Map(draftRows(d).map((r) => [r.id, r.value]));
    const method = d.itemized ? 'exact' : d.method;
    const keepInput = method === 'percent' || method === 'shares' || method === 'adjust';
    return allocs
      .filter((a) => method !== 'exact' || a.amount > 0)
      .map((a) => ({ profileId: a.id, amount: a.amount, inputValue: keepInput ? (raw.get(a.id) ?? null) : null }));
  };

  const pickReceipt = async () => {
    const file = await chooseImage('Attach receipt');
    if (file) d.patch({ receipt: { uri: file.uri, mimeType: file.mimeType, size: file.size ?? null } });
  };
  const attach = () =>
    alert('Add to expense', undefined, [
      { text: d.receipt ? 'Replace receipt photo' : 'Attach receipt photo', onPress: pickReceipt },
      { text: d.notes ? 'Edit note' : 'Add a note', onPress: () => setSheet('note') },
      ...(d.receipt
        ? [{ text: 'Remove receipt', style: 'destructive' as const, onPress: () => d.patch({ receipt: null }) }]
        : []),
      { text: 'Cancel', style: 'cancel' as const },
    ]);

  const payer = people.get(d.paidBy);
  const symbol = currencySymbol(d.currency, locale);

  return (
    <Screen
      gap={16}
      footer={
        <Button
          label={d.expenseId ? 'Save changes' : 'Save expense'}
          onPress={submit}
          loading={save.isPending || loadingEdit}
          disabled={!d.groupId}
        />
      }
    >
      <Header
        title={d.expenseId ? 'Edit expense' : 'Add expense'}
        left="close"
        right={<IconButton icon="scan-line" label="Scan receipt" onPress={pickReceipt} />}
      />

      <Pressable
        onPress={() => !d.expenseId && setSheet('group')}
        disabled={!!d.expenseId}
        accessibilityLabel={`Group: ${group?.name ?? 'choose'}`}
        style={styles.groupChip}
      >
        <View style={styles.groupIcon}>
          <Icon name={group?.icon ?? 'users'} size={14} color={colors.mint} />
        </View>
        <Text variant="secondaryMedium">
          {group?.name ?? (activeGroups.length ? 'Choose a group' : 'Create a group first')}
        </Text>
        {!d.expenseId ? <Icon name="chevron-down" size={16} color={colors.textFaint} /> : null}
      </Pressable>

      <View style={styles.amountBlock}>
        <View style={styles.amountRow}>
          <Text style={[typography.h2, { fontFamily: fontFamily.medium, fontSize: 28 }]} color={colors.textFaint}>
            {symbol}
          </Text>
          <TextInput
            value={d.amountText}
            onChangeText={(t) => d.patch({ amountText: t.replace(/[^0-9.,]/g, '').replace(',', '.') })}
            onBlur={() => (d.method === 'exact' || d.method === 'percent') && d.reseed()}
            placeholder="0.00"
            placeholderTextColor={colors.disabled}
            keyboardType="decimal-pad"
            accessibilityLabel="Amount"
            selectionColor={colors.positive}
            style={[typography.display, styles.amountInput, { color: colors.ink }]}
            autoFocus={!d.expenseId && !keepDraft}
            maxLength={14}
            editable={!d.itemized}
          />
        </View>
        <Pressable
          onPress={() => setSheet('currency')}
          accessibilityLabel={`Currency ${d.currency}`}
          style={styles.curChip}
        >
          <Text variant="captionStrong">{d.currency}</Text>
        </Pressable>
        {d.itemized ? (
          <Pressable
            onPress={() => router.push('/add-expense/items')}
            accessibilityRole="button"
            accessibilityLabel="Total comes from the items. Edit items"
            hitSlop={8}
          >
            <Text variant="captionStrong" color={colors.positive}>
              Total from items · Edit items
            </Text>
          </Pressable>
        ) : null}
        {errors.amount ? (
          <Text variant="caption" color={colors.negative}>
            {errors.amount}
          </Text>
        ) : null}
      </View>

      <View style={[styles.field, errors.description ? { borderWidth: 1.5, borderColor: colors.negative } : null]}>
        <Icon name="pencil-line" size={18} color={colors.textFaint} />
        <TextInput
          value={d.description}
          onChangeText={(description) => d.patch({ description })}
          placeholder="What was it for?"
          placeholderTextColor={colors.textFaint}
          accessibilityLabel="Description"
          maxLength={120}
          style={styles.fieldInput}
          returnKeyType="done"
        />
      </View>

      <View style={styles.twoCol}>
        <Pressable
          onPress={() => setSheet('category')}
          accessibilityLabel={`Category ${categoryName(d.categoryId)}`}
          style={[styles.field, { flex: 1, paddingHorizontal: 14 }]}
        >
          <IconTile
            icon={categoryIcon(d.categoryId)}
            size={28}
            radius={8}
            bg={colors.positiveSoft}
            fg={colors.positive}
            iconSize={15}
          />
          <Text variant="body" numberOfLines={1} style={{ flex: 1 }}>
            {categoryName(d.categoryId)}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setSheet('date')}
          accessibilityLabel={`Date ${d.date}`}
          style={[styles.field, { flex: 1, paddingHorizontal: 14 }]}
        >
          <Icon name="calendar" size={18} color={colors.textFaint} />
          <Text variant="body" numberOfLines={1} style={{ flex: 1 }}>
            {formatRelativeDay(d.date, dateFormat)}
          </Text>
        </Pressable>
      </View>

      <Card radius={radii.card}>
        <Pressable
          onPress={() => setSheet('payer')}
          disabled={!group}
          scaleOnPress={false}
          accessibilityLabel={`Paid by ${people.label(d.paidBy)}`}
          style={[styles.cardRow, styles.divider]}
        >
          <Text variant="secondary" color={colors.textMuted} style={styles.cardLabel}>
            Paid by
          </Text>
          {d.paidBy ? <Avatar id={d.paidBy} name={payer.name} uri={payer.avatarUrl} size={28} /> : null}
          <Text variant="bodyMedium" style={{ flex: 1 }}>
            {d.paidBy ? people.label(d.paidBy) : '—'}
          </Text>
          <Icon name="chevron-right" size={18} color={colors.textFaint} />
        </Pressable>
        <Pressable
          onPress={() => router.push('/add-expense/split')}
          disabled={!group}
          scaleOnPress={false}
          accessibilityLabel="Split options"
          style={[styles.cardRow, !d.expenseId && styles.divider]}
        >
          <Text variant="secondary" color={colors.textMuted} style={styles.cardLabel}>
            Split
          </Text>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyMedium">
              {d.itemized ? 'By item' : meta.summary} · {participants} {participants === 1 ? 'person' : 'people'}
            </Text>
            {evaluation.ok ? (
              <View style={{ flexDirection: 'row' }}>
                <Text variant="caption" color={colors.positive}>
                  Your share{' '}
                </Text>
                <AmountText minor={myShare ?? 0} currency={d.currency} tone="positive" variant="caption" />
              </View>
            ) : amount > 0 ? (
              <Text variant="caption" color={colors.negative}>
                Split doesn’t add up — tap to fix
              </Text>
            ) : null}
          </View>
          <Icon name="chevron-right" size={18} color={colors.textFaint} />
        </Pressable>
        {d.expenseId ? null : (
          <Pressable
            onPress={() => setSheet('repeat')}
            disabled={!group}
            scaleOnPress={false}
            accessibilityLabel={`Repeat: ${repeatLabel(d.repeat)}`}
            style={styles.cardRow}
          >
            <Text variant="secondary" color={colors.textMuted} style={styles.cardLabel}>
              Repeat
            </Text>
            <Icon name="refresh-cw" size={16} color={d.repeat === 'never' ? colors.textFaint : colors.positive} />
            <Text variant="bodyMedium" color={d.repeat === 'never' ? colors.ink : colors.positive} style={{ flex: 1 }}>
              {repeatLabel(d.repeat)}
            </Text>
            <Icon name="chevron-right" size={18} color={colors.textFaint} />
          </Pressable>
        )}
      </Card>

      <Pressable onPress={attach} accessibilityLabel="Attach receipt or add a note" style={styles.attach}>
        {d.receipt ? (
          <View style={styles.attachFilled}>
            <Image source={{ uri: d.receipt.uri }} style={styles.thumb} contentFit="cover" />
            <View style={{ flex: 1 }}>
              <Text variant="bodyMedium">Receipt attached</Text>
              <Text variant="caption" color={colors.textSubtle} numberOfLines={1}>
                {d.notes ? d.notes : 'Tap to add a note or replace'}
              </Text>
            </View>
          </View>
        ) : d.notes ? (
          <View style={styles.attachFilled}>
            <Icon name="file-text" size={18} color={colors.textMuted} />
            <Text variant="body" color={colors.textMuted} numberOfLines={2} style={{ flex: 1 }}>
              {d.notes}
            </Text>
          </View>
        ) : (
          <>
            <Icon name="paperclip" size={18} color={colors.textMuted} />
            <Text variant="body" color={colors.textMuted}>
              Attach receipt or add a note
            </Text>
          </>
        )}
      </Pressable>

      <SelectSheet
        visible={sheet === 'group'}
        onClose={() => setSheet(null)}
        title="Group"
        options={activeGroups.map((g) => ({
          value: g.id,
          label: g.name,
          description: `${activeMembers(g).length} members · ${g.currency}`,
          icon: g.icon,
        }))}
        value={d.groupId}
        onSelect={(gid) => {
          const g = activeGroups.find((x) => x.id === gid);
          if (g) d.setGroup(g, myId);
        }}
      />
      <SelectSheet
        visible={sheet === 'currency'}
        onClose={() => setSheet(null)}
        title="Currency"
        options={currencyOptions}
        value={d.currency}
        // Item amounts are typed in one currency, so changing it starts the items over.
        onSelect={(currency) => d.patch({ currency, itemized: false, items: [], extraText: '' })}
        searchable
        searchPlaceholder="Search currencies"
      />
      <SelectSheet
        visible={sheet === 'repeat'}
        onClose={() => setSheet(null)}
        title="Repeat"
        options={REPEAT_OPTIONS}
        value={d.repeat}
        onSelect={(repeat) => d.patch({ repeat })}
      />
      <SelectSheet
        visible={sheet === 'category'}
        onClose={() => setSheet(null)}
        title="Category"
        options={(categories.data ?? []).map((c) => ({ value: c.id, label: c.name, icon: c.icon }))}
        value={d.categoryId}
        onSelect={(categoryId) => d.patch({ categoryId })}
      />
      <SelectSheet
        visible={sheet === 'payer'}
        onClose={() => setSheet(null)}
        title="Paid by"
        options={d.memberIds.map((id) => {
          const p = people.get(id);
          return {
            value: id,
            label: id === myId ? 'You' : p.name,
            left: <Avatar id={id} name={p.name} uri={p.avatarUrl} size={32} />,
          };
        })}
        value={d.paidBy}
        onSelect={(paidBy) => d.patch({ paidBy })}
      />
      <DateSheet
        visible={sheet === 'date'}
        onClose={() => setSheet(null)}
        value={d.date}
        onChange={(date) => d.patch({ date })}
      />
      {sheet === 'note' ? (
        <NoteSheet onClose={() => setSheet(null)} value={d.notes} onSave={(notes) => d.patch({ notes })} />
      ) : null}
      {group && d.currency !== group.currency ? (
        <Text variant="caption" color={colors.textSubtle} align="center">
          This expense is in {currencyLabel(d.currency)}. It’s tracked separately from the group’s {group.currency}{' '}
          balances.
        </Text>
      ) : null}
    </Screen>
  );
}

/** Mounted only while open, so it always starts from the current note. */
function NoteSheet({ onClose, value, onSave }: { onClose: () => void; value: string; onSave: (v: string) => void }) {
  const [text, setText] = useState(value);
  return (
    <Sheet visible onClose={onClose} title="Note">
      <View style={{ paddingHorizontal: 20, gap: 12 }}>
        <TextInput
          value={text}
          onChangeText={setText}
          multiline
          maxLength={1000}
          placeholder="Anything worth remembering?"
          placeholderTextColor={colors.textFaint}
          accessibilityLabel="Note"
          style={styles.note}
          autoFocus
        />
        <Button
          label="Save note"
          onPress={() => {
            onSave(text);
            onClose();
          }}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  groupChip: {
    alignSelf: 'center',
    height: 36,
    paddingLeft: 8,
    paddingRight: 14,
    borderRadius: 18,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  groupIcon: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: colors.forestCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  amountBlock: { alignItems: 'center', gap: 8, paddingTop: 6, paddingBottom: 4 },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  amountInput: { minWidth: 120, textAlign: 'center', padding: 0 },
  curChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: colors.surfaceMuted2,
    minHeight: 28,
    justifyContent: 'center',
  },
  field: {
    height: 52,
    borderRadius: radii.input,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  fieldInput: { flex: 1, height: '100%', fontFamily: fontFamily.regular, fontSize: 15, color: colors.text, padding: 0 },
  twoCol: { flexDirection: 'row', gap: 10 },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 56,
  },
  cardLabel: { width: 64 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  attach: {
    minHeight: 64,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.dashed,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
  },
  attachFilled: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  thumb: { width: 44, height: 44, borderRadius: 10 },
  note: {
    minHeight: 120,
    borderRadius: radii.input,
    backgroundColor: colors.surface,
    padding: 14,
    fontFamily: fontFamily.regular,
    fontSize: 15,
    color: colors.text,
    textAlignVertical: 'top',
  },
});
