import type { CurrencyCode } from './currency';
import { assertMinor, type Minor } from './minor';

export interface ExpenseLedgerEntry {
  id: string;
  currency: CurrencyCode;
  amount: Minor;
  paidBy: string;
  splits: readonly { userId: string; amount: Minor }[];
  /** Voided/deleted expenses never count toward balances. */
  voided?: boolean;
}

export interface SettlementLedgerEntry {
  id: string;
  currency: CurrencyCode;
  amount: Minor;
  /** The person who paid money to settle a debt. */
  fromUserId: string;
  toUserId: string;
  /** Rejected or deleted settlements never count. */
  voided?: boolean;
}

/** currency → userId → net (positive = is owed money, negative = owes money). */
export type NetBalances = Map<CurrencyCode, Map<string, Minor>>;

function bump(map: NetBalances, currency: CurrencyCode, userId: string, delta: Minor) {
  let inner = map.get(currency);
  if (!inner) {
    inner = new Map();
    map.set(currency, inner);
  }
  const next = (inner.get(userId) ?? 0) + delta;
  assertMinor(next, 'balance');
  inner.set(userId, next);
}

/**
 * Reproduce balances from the ledger. Each currency is kept separate and
 * is never converted. A settlement moves money between people: it is not
 * spending, it only cancels debt.
 */
export function computeNetBalances(
  expenses: readonly ExpenseLedgerEntry[],
  settlements: readonly SettlementLedgerEntry[] = [],
): NetBalances {
  const nets: NetBalances = new Map();

  for (const e of expenses) {
    if (e.voided) continue;
    assertMinor(e.amount, `expense ${e.id} amount`);
    const splitSum = e.splits.reduce((s, x) => s + x.amount, 0);
    if (splitSum !== e.amount) {
      throw new RangeError(`Expense ${e.id}: splits sum to ${splitSum}, expected ${e.amount}`);
    }
    bump(nets, e.currency, e.paidBy, e.amount);
    for (const s of e.splits) bump(nets, e.currency, s.userId, -s.amount);
  }

  for (const s of settlements) {
    if (s.voided) continue;
    assertMinor(s.amount, `settlement ${s.id} amount`);
    if (s.fromUserId === s.toUserId) throw new RangeError(`Settlement ${s.id} pays itself`);
    bump(nets, s.currency, s.fromUserId, s.amount);
    bump(nets, s.currency, s.toUserId, -s.amount);
  }

  return nets;
}

export interface Transfer {
  from: string;
  to: string;
  amount: Minor;
}

/**
 * Minimise the number of payments needed to clear a set of net balances
 * (greedy: match the largest debtor with the largest creditor). It produces
 * at most n − 1 transfers. Ties are broken by user id, so the output is
 * fully deterministic.
 */
export function simplifyDebts(nets: ReadonlyMap<string, Minor>): Transfer[] {
  let total = 0;
  const creditors: { id: string; amt: Minor }[] = [];
  const debtors: { id: string; amt: Minor }[] = [];
  for (const [id, amt] of nets) {
    assertMinor(amt);
    total += amt;
    if (amt > 0) creditors.push({ id, amt });
    else if (amt < 0) debtors.push({ id, amt: -amt });
  }
  if (total !== 0) throw new RangeError(`Net balances must sum to zero, got ${total}`);

  const byAmtThenId = (a: { id: string; amt: Minor }, b: { id: string; amt: Minor }) =>
    b.amt - a.amt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

  const transfers: Transfer[] = [];
  while (creditors.length && debtors.length) {
    creditors.sort(byAmtThenId);
    debtors.sort(byAmtThenId);
    const c = creditors[0]!;
    const d = debtors[0]!;
    const amount = Math.min(c.amt, d.amt);
    transfers.push({ from: d.id, to: c.id, amount });
    c.amt -= amount;
    d.amt -= amount;
    if (c.amt === 0) creditors.shift();
    if (d.amt === 0) debtors.shift();
  }
  return transfers;
}

export interface PersonalSummary {
  /** Sum of what others owe you (≥ 0). */
  owedToYou: Minor;
  /** Sum of what you owe others (≥ 0). */
  youOwe: Minor;
  /** owedToYou − youOwe. */
  net: Minor;
}

/** Combine several per-group nets for one user in ONE currency. */
export function summarizeForUser(groupNets: readonly Minor[]): PersonalSummary {
  let owedToYou = 0;
  let youOwe = 0;
  for (const n of groupNets) {
    assertMinor(n);
    if (n > 0) owedToYou += n;
    else youOwe += -n;
  }
  return { owedToYou, youOwe, net: owedToYou - youOwe };
}

/** From a user's point of view: who owes them / whom they owe, per counterparty (one currency). */
export function counterpartiesFor(userId: string, transfers: readonly Transfer[]): Map<string, Minor> {
  const out = new Map<string, Minor>();
  for (const t of transfers) {
    if (t.to === userId) out.set(t.from, (out.get(t.from) ?? 0) + t.amount);
    else if (t.from === userId) out.set(t.to, (out.get(t.to) ?? 0) - t.amount);
  }
  return out;
}
