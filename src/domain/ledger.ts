/**
 * Client-side read models derived from server balances. Pure functions —
 * the server remains authoritative for every number; these only reshape
 * and simplify for display. Currencies are never combined.
 */
import { simplifyDebts, summarizeForUser, type CurrencyCode, type Minor, type Transfer } from './money';

export interface BalanceLike {
  groupId: string;
  profileId: string;
  currency: CurrencyCode;
  net: Minor;
}

export interface ExpenseLike {
  amount: Minor;
  paidBy: string;
  splits: readonly { profileId: string; amount: Minor }[];
}

/** groupId → currency → profileId → net */
export function indexBalances(rows: readonly BalanceLike[]) {
  const out = new Map<string, Map<CurrencyCode, Map<string, Minor>>>();
  for (const r of rows) {
    let g = out.get(r.groupId);
    if (!g) out.set(r.groupId, (g = new Map()));
    let c = g.get(r.currency);
    if (!c) g.set(r.currency, (c = new Map()));
    c.set(r.profileId, (c.get(r.profileId) ?? 0) + r.net);
  }
  return out;
}

/** My net per currency in one group (only non-zero currencies). */
export function myGroupNets(
  rows: readonly BalanceLike[],
  groupId: string,
  me: string,
): { currency: CurrencyCode; net: Minor }[] {
  return rows
    .filter((r) => r.groupId === groupId && r.profileId === me && r.net !== 0)
    .map((r) => ({ currency: r.currency, net: r.net }));
}

/** Simplified "who owes whom" for a group, per currency. */
export function groupTransfers(
  rows: readonly BalanceLike[],
  groupId: string,
): { currency: CurrencyCode; transfers: Transfer[] }[] {
  const byCur = indexBalances(rows.filter((r) => r.groupId === groupId)).get(groupId);
  if (!byCur) return [];
  return [...byCur.entries()].map(([currency, nets]) => ({ currency, transfers: simplifyDebts(nets) }));
}

export interface CurrencySummary {
  currency: CurrencyCode;
  owedToYou: Minor;
  youOwe: Minor;
  net: Minor;
  groupIds: string[];
}

/**
 * Dashboard totals for one user, one summary per currency. The primary
 * currency (default currency, or else the busiest) is listed first; the
 * others are shown separately and never merged into it.
 */
export function dashboardSummary(rows: readonly BalanceLike[], me: string, preferred: CurrencyCode): CurrencySummary[] {
  const perCur = new Map<CurrencyCode, { nets: Minor[]; groupIds: string[] }>();
  for (const r of rows) {
    if (r.profileId !== me || r.net === 0) continue;
    const e = perCur.get(r.currency) ?? { nets: [], groupIds: [] };
    e.nets.push(r.net);
    e.groupIds.push(r.groupId);
    perCur.set(r.currency, e);
  }
  const list = [...perCur.entries()].map(([currency, e]) => ({
    currency,
    ...summarizeForUser(e.nets),
    groupIds: e.groupIds,
  }));
  if (!perCur.has(preferred)) list.push({ currency: preferred, owedToYou: 0, youOwe: 0, net: 0, groupIds: [] });
  return list.sort((a, b) =>
    a.currency === preferred
      ? -1
      : b.currency === preferred
        ? 1
        : b.groupIds.length - a.groupIds.length || a.currency.localeCompare(b.currency),
  );
}

export interface Debt {
  groupId: string;
  currency: CurrencyCode;
  from: string;
  to: string;
  amount: Minor;
}

/** Every simplified transfer involving the user, across all groups. */
export function myDebts(rows: readonly BalanceLike[], me: string): Debt[] {
  const groupIds = [...new Set(rows.map((r) => r.groupId))];
  const out: Debt[] = [];
  for (const groupId of groupIds) {
    for (const { currency, transfers } of groupTransfers(rows, groupId)) {
      for (const t of transfers) if (t.from === me || t.to === me) out.push({ groupId, currency, ...t });
    }
  }
  return out;
}

export interface FriendBalance {
  profileId: string;
  /** Per currency; positive = they owe you, negative = you owe them. */
  byCurrency: { currency: CurrencyCode; net: Minor }[];
}

/** Aggregate per-person balances (from simplified group debts) for the Friends tab. */
export function friendBalances(rows: readonly BalanceLike[], me: string): Map<string, FriendBalance> {
  const acc = new Map<string, Map<CurrencyCode, Minor>>();
  for (const d of myDebts(rows, me)) {
    const other = d.from === me ? d.to : d.from;
    const sign = d.to === me ? 1 : -1;
    let m = acc.get(other);
    if (!m) acc.set(other, (m = new Map()));
    m.set(d.currency, (m.get(d.currency) ?? 0) + sign * d.amount);
  }
  const out = new Map<string, FriendBalance>();
  for (const [profileId, m] of acc) {
    out.set(profileId, {
      profileId,
      byCurrency: [...m.entries()].filter(([, n]) => n !== 0).map(([currency, net]) => ({ currency, net })),
    });
  }
  return out;
}

/** What one expense means for me: "you lent $135" / "you owe $30" / "not involved". */
export function expenseImpact(e: ExpenseLike, me: string): { kind: 'lent' | 'owe' | 'none'; amount: Minor } {
  const myShare = e.splits.find((s) => s.profileId === me)?.amount ?? 0;
  if (e.paidBy === me) {
    const lent = e.amount - myShare;
    return lent > 0 ? { kind: 'lent', amount: lent } : { kind: 'none', amount: 0 };
  }
  return myShare > 0 ? { kind: 'owe', amount: myShare } : { kind: 'none', amount: 0 };
}

/** Amount still owed from `from` to `to` in a group+currency after simplification. */
export function remainingOwed(
  rows: readonly BalanceLike[],
  groupId: string,
  currency: CurrencyCode,
  from: string,
  to: string,
): Minor {
  const g = groupTransfers(rows, groupId).find((x) => x.currency === currency);
  return g?.transfers.find((t) => t.from === from && t.to === to)?.amount ?? 0;
}
