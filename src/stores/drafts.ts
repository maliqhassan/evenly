import * as Crypto from 'expo-crypto';
import { create } from 'zustand';

import type { Expense, ExpenseItemization, Group, PaymentMethod, RepeatFrequency, SplitDefault } from '@/api';
import {
  defaultSplitValues,
  evaluateItemized,
  evaluateSplit,
  formatBp,
  FULL_PERCENT_BP,
  minorToDecimalString,
  parseBp,
  parseMinor,
  SHARE_SCALE,
  type CurrencyCode,
  type SplitMethod,
  type SplitRowInput,
} from '@/domain/money';
import type { ParsedReceipt } from '@/domain/receipt';
import { todayISO } from '@/lib/dates';

/* --------------------------- onboarding draft --------------------------- */

interface OnboardingDraft {
  fullName: string;
  phone: string;
  avatarUri: string | null;
  avatarMime: string | null;
  set: (p: Partial<Omit<OnboardingDraft, 'set'>>) => void;
}

export const useOnboardingDraft = create<OnboardingDraft>((set) => ({
  fullName: '',
  phone: '',
  avatarUri: null,
  avatarMime: null,
  set: (p) => set(p),
}));

/* ----------------------------- expense draft ---------------------------- */

/** One line of an itemized bill while it is being edited. */
export interface DraftItem {
  id: string;
  name: string;
  amountText: string;
  memberIds: string[];
}

/**
 * Shared state between Add expense (15) and Split (16). Raw text inputs are
 * kept per split mode so switching modes never loses what was typed.
 */
export interface ExpenseDraft {
  clientId: string;
  expenseId: string | null;
  expectedVersion: number | null;
  groupId: string | null;
  amountText: string;
  currency: CurrencyCode;
  description: string;
  categoryId: string;
  date: string;
  paidBy: string | null;
  notes: string;
  method: SplitMethod;
  /** Member order is the stable order used for remainder allocation. */
  memberIds: string[];
  included: Record<string, boolean>;
  inputs: Record<SplitMethod, Record<string, string>>;
  receipt: { uri: string; mimeType: string; size: number | null } | null;
  /** Create a recurring expense from this one (new expenses only). */
  repeat: 'never' | RepeatFrequency;
  /** Split by item: the amount is the items' total and the split comes from them. */
  itemized: boolean;
  items: DraftItem[];
  /** Tax / tip, shared in proportion to what each person ordered. */
  extraText: string;
  /** The expense being edited already had items (so turning them off must remove them). */
  hadItems: boolean;
}

const emptyInputs = (): Record<SplitMethod, Record<string, string>> => ({
  equal: {},
  exact: {},
  percent: {},
  shares: {},
  adjust: {},
});

const blank = (): ExpenseDraft => ({
  clientId: Crypto.randomUUID(),
  expenseId: null,
  expectedVersion: null,
  groupId: null,
  amountText: '',
  currency: 'USD',
  description: '',
  categoryId: 'general',
  date: todayISO(),
  paidBy: null,
  notes: '',
  method: 'equal',
  memberIds: [],
  included: {},
  inputs: emptyInputs(),
  receipt: null,
  repeat: 'never',
  itemized: false,
  items: [],
  extraText: '',
  hadItems: false,
});

/** Convert raw text to the numeric value each mode expects (see SplitRowInput). */
export function parseSplitInput(method: SplitMethod, text: string, currency: CurrencyCode): number | null {
  const t = text.trim();
  switch (method) {
    case 'equal':
      return 0;
    case 'exact':
      return t === '' ? 0 : parseMinor(t, currency);
    case 'percent':
      return t === '' ? 0 : parseBp(t);
    case 'shares': {
      if (t === '') return 0;
      const m = t.match(/^(\d{0,4})(?:\.(\d{0,2}))?$/);
      return m && (m[1] || m[2]) ? Number(m[1] || '0') * SHARE_SCALE + Number((m[2] ?? '').padEnd(2, '0')) : null;
    }
    case 'adjust': {
      if (t === '' || t === '-' || t === '+') return 0;
      const neg = t.startsWith('-');
      const v = parseMinor(t.replace(/^[+-]/, ''), currency);
      return v === null ? null : neg ? -v : v;
    }
  }
}

/** Format a numeric split value back into input text. */
export function formatSplitInput(method: SplitMethod, value: number, currency: CurrencyCode): string {
  switch (method) {
    case 'equal':
      return '';
    case 'exact':
      return minorToDecimalString(value, currency);
    case 'percent':
      return formatBp(value);
    case 'shares':
      return value % SHARE_SCALE === 0
        ? String(value / SHARE_SCALE)
        : (value / SHARE_SCALE).toFixed(2).replace(/0$/, '');
    case 'adjust':
      return value === 0 ? '0' : (value > 0 ? '+' : '-') + minorToDecimalString(Math.abs(value), currency);
  }
}

export function draftAmount(d: ExpenseDraft): number {
  return parseMinor(d.amountText, d.currency) ?? 0;
}

export function draftRows(d: ExpenseDraft): SplitRowInput[] {
  return d.memberIds.map((id) => ({
    id,
    included: d.method === 'exact' ? true : (d.included[id] ?? false),
    value: parseSplitInput(d.method, d.inputs[d.method][id] ?? '', d.currency) ?? Number.NaN,
  }));
}

/** The draft's items as validated bill items, or why they're not valid yet. */
export function parseDraftItems(d: ExpenseDraft): ExpenseItemization | { error: string } {
  if (d.items.length === 0) return { error: 'Add at least one item' };
  const items: ExpenseItemization['items'] = [];
  for (const [n, it] of d.items.entries()) {
    const amount = parseMinor(it.amountText, d.currency);
    if (amount === null || amount <= 0) return { error: `Enter an amount for item ${n + 1}` };
    if (it.memberIds.length === 0) return { error: `Choose who had item ${n + 1}` };
    items.push({ name: it.name.trim() || `Item ${n + 1}`, amount, memberIds: it.memberIds });
  }
  const extra = d.extraText.trim() === '' ? 0 : parseMinor(d.extraText, d.currency);
  if (extra === null) return { error: 'Tax and tip is not a valid amount' };
  return { items, extra };
}

/** The itemization to save with the expense, or null when the draft isn't itemized. */
export function draftItemization(d: ExpenseDraft): ExpenseItemization | null {
  if (!d.itemized) return null;
  const parsed = parseDraftItems(d);
  return 'error' in parsed ? null : parsed;
}

const invalidSplit = (message: string) => ({
  ok: false as const,
  reason: 'invalid' as const,
  message,
  allocations: [],
  allocated: 0,
  remaining: 0,
});

export function evaluateDraft(d: ExpenseDraft) {
  if (!d.itemized) return evaluateSplit(d.method, draftAmount(d), draftRows(d));
  const parsed = parseDraftItems(d);
  if ('error' in parsed) return invalidSplit(parsed.error);
  const result = evaluateItemized(parsed.items, parsed.extra, d.memberIds);
  // The amount always comes from the items; refuse a draft where they've drifted apart.
  if (result.ok && result.allocated !== draftAmount(d)) return invalidSplit('The amount no longer matches the items');
  return result;
}

interface ExpenseDraftStore extends ExpenseDraft {
  /** Start a new expense in a group. */
  start: (opts: { group: Group | null; me: string; receipt?: ExpenseDraft['receipt'] }) => void;
  /** Load an existing expense for editing. */
  startEdit: (expense: Expense & { itemization?: ExpenseItemization | null }, group: Group) => void;
  setGroup: (group: Group, me: string) => void;
  patch: (p: Partial<ExpenseDraft>) => void;
  setMethod: (m: SplitMethod) => void;
  toggle: (id: string) => void;
  setInput: (id: string, text: string) => void;
  /** Re-seed the current mode's inputs from the amount (e.g. after the amount changes). */
  reseed: () => void;
  /** Start from the user's saved default split for this group (ignored if it no longer fits). */
  applyDefault: (def: SplitDefault) => void;
  /**
   * Fill the draft from a scanned receipt. 'total' sets the amount; 'items' also
   * lists the items (everyone had each one) ready to adjust on the Items screen.
   * Details already typed (the description) are kept.
   */
  applyReceipt: (receipt: ParsedReceipt, mode: 'total' | 'items') => void;
}

/** The current split as a saveable default, or null for modes that depend on the total (exact, adjust). */
export function draftAsDefault(d: ExpenseDraft): SplitDefault | null {
  if (d.method !== 'equal' && d.method !== 'percent' && d.method !== 'shares') return null;
  return {
    method: d.method,
    members: d.memberIds.map((id) => ({
      profileId: id,
      included: !!d.included[id],
      value: d.method === 'equal' ? 0 : (parseSplitInput(d.method, d.inputs[d.method][id] ?? '', d.currency) ?? 0),
    })),
  };
}

/** True when two defaults describe the same split (order-independent). */
export function sameDefault(a: SplitDefault | null | undefined, b: SplitDefault | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  if (a.method !== b.method) return false;
  const key = (d: SplitDefault) =>
    d.members
      .filter((m) => m.included)
      .map((m) => `${m.profileId}:${d.method === 'equal' ? 0 : m.value}`)
      .sort()
      .join('|');
  return key(a) === key(b);
}

const activeMemberIds = (group: Group, me: string) => {
  const ids = group.members.filter((m) => m.status === 'active').map((m) => m.profileId);
  // "You" first, then everyone else in join order — the stable order for leftover cents.
  return [me, ...ids.filter((id) => id !== me)].filter((id) => ids.includes(id));
};

export const useExpenseDraft = create<ExpenseDraftStore>((set, get) => ({
  ...blank(),

  start: ({ group, me, receipt }) => {
    const base = blank();
    set({ ...base, receipt: receipt ?? null });
    if (group) get().setGroup(group, me);
  },

  startEdit: (e, group) => {
    const ids = group.members
      .filter((m) => m.status === 'active' || e.splits.some((s) => s.profileId === m.profileId))
      .map((m) => m.profileId);
    const inputs = emptyInputs();
    const included: Record<string, boolean> = {};
    for (const id of ids) included[id] = false;
    for (const s of e.splits) {
      included[s.profileId] = true;
      const v = e.splitMethod === 'exact' ? s.amount : s.inputValue;
      if (v !== null && e.splitMethod !== 'equal')
        inputs[e.splitMethod][s.profileId] = formatSplitInput(e.splitMethod, v, e.currency);
    }
    set({
      ...blank(),
      expenseId: e.id,
      expectedVersion: e.version,
      groupId: e.groupId,
      amountText: minorToDecimalString(e.amount, e.currency),
      currency: e.currency,
      description: e.description,
      categoryId: e.categoryId,
      date: e.date,
      paidBy: e.paidBy,
      notes: e.notes ?? '',
      method: e.splitMethod,
      memberIds: ids,
      included,
      inputs,
      itemized: !!e.itemization,
      hadItems: !!e.itemization,
      items: (e.itemization?.items ?? []).map((it, n) => ({
        id: `item-${n}`,
        name: it.name,
        amountText: minorToDecimalString(it.amount, e.currency),
        memberIds: it.memberIds,
      })),
      extraText: e.itemization?.extra ? minorToDecimalString(e.itemization.extra, e.currency) : '',
    });
  },

  setGroup: (group, me) => {
    const ids = activeMemberIds(group, me);
    const included = Object.fromEntries(ids.map((id) => [id, true]));
    set({
      groupId: group.id,
      currency: group.currency,
      memberIds: ids,
      included,
      paidBy: me,
      method: 'equal',
      inputs: emptyInputs(),
      itemized: false,
      items: [],
      extraText: '',
    });
  },

  patch: (p) => set(p),

  setMethod: (method) => {
    set({ method });
    const d = get();
    const hasInputs = Object.keys(d.inputs[method]).length > 0;
    if (!hasInputs) get().reseed();
  },

  toggle: (id) => {
    set((d) => ({ included: { ...d.included, [id]: !d.included[id] } }));
    const d = get();
    if (d.method === 'percent' || d.method === 'exact') get().reseed();
  },

  setInput: (id, text) => set((d) => ({ inputs: { ...d.inputs, [d.method]: { ...d.inputs[d.method], [id]: text } } })),

  applyReceipt: (r, mode) => {
    const d = get();
    const p: Partial<ExpenseDraft> = { itemized: false };
    if (r.merchant && !d.description.trim()) p.description = r.merchant;
    if (r.date) p.date = r.date;
    if (r.total !== null) p.amountText = minorToDecimalString(r.total, d.currency);
    if (mode === 'items') {
      p.items = r.items.map((it, n) => ({
        id: `scan-${n}`,
        name: it.name,
        amountText: minorToDecimalString(it.amount, d.currency),
        memberIds: [...d.memberIds],
      }));
      p.extraText = r.extra > 0 ? minorToDecimalString(r.extra, d.currency) : '';
    } else {
      p.items = [];
      p.extraText = '';
    }
    set(p);
  },

  applyDefault: (def) => {
    const d = get();
    // Only people still in the group count; anyone new since it was saved is left out.
    const byId = new Map(def.members.map((m) => [m.profileId, m]));
    const included = Object.fromEntries(d.memberIds.map((id) => [id, byId.get(id)?.included ?? false]));
    const ids = d.memberIds.filter((id) => included[id]);
    if (ids.length === 0) return;
    const total = ids.reduce((sum, id) => sum + (byId.get(id)?.value ?? 0), 0);
    if (def.method === 'percent' && total !== FULL_PERCENT_BP) return; // someone left: no longer adds to 100%
    if (def.method === 'shares' && total <= 0) return;
    const text: Record<string, string> = {};
    for (const id of d.memberIds) {
      text[id] =
        def.method === 'equal' ? '' : formatSplitInput(def.method, included[id] ? byId.get(id)!.value : 0, d.currency);
    }
    set({ method: def.method, included, inputs: { ...emptyInputs(), [def.method]: text } });
  },

  reseed: () => {
    const d = get();
    if (d.method === 'equal') return;
    const ids =
      d.method === 'exact' ? d.memberIds.filter((id) => d.included[id]) : d.memberIds.filter((id) => d.included[id]);
    const values = defaultSplitValues(d.method, draftAmount(d), ids);
    const text: Record<string, string> = {};
    d.memberIds.forEach((id) => {
      const i = ids.indexOf(id);
      text[id] = i >= 0 ? formatSplitInput(d.method, values[i]!, d.currency) : d.method === 'exact' ? '0.00' : '0';
    });
    set({ inputs: { ...d.inputs, [d.method]: text } });
  },
}));

/* ---------------------------- settlement draft --------------------------- */

export interface SettlementDraft {
  clientId: string;
  groupId: string;
  from: string;
  to: string;
  amountText: string;
  currency: CurrencyCode;
  method: PaymentMethod;
  reference: string;
  date: string;
}

/* ----------------------------- pending invite ---------------------------- */

/** Invite code captured from a deep link before the user was signed in. */
export const usePendingInvite = create<{ code: string | null; set: (code: string | null) => void }>((set) => ({
  code: null,
  set: (code) => set({ code }),
}));
