import { sumMinor, type Minor } from './minor';
import { allocateByWeights, splitEqual, type Allocation, type SplitEvaluation } from './split';

/** One line of a bill, shared equally by the people who had it. */
export interface BillItem {
  amount: Minor;
  memberIds: readonly string[];
}

export interface ItemizedSplit {
  /** What each person owes in total (their items plus their share of tax and tip), in `order`. */
  allocations: Allocation[];
  /** What each person owes for items alone, before tax and tip. */
  subtotals: Allocation[];
  itemsTotal: Minor;
  extra: Minor;
  total: Minor;
}

/**
 * Split a bill item by item.
 *
 * - Each item is split equally among the people who had it (largest-remainder,
 *   so cents are never lost; leftover cents go to whoever comes first in `order`).
 * - `extra` (tax, tip, delivery…) is shared in proportion to each person's items.
 *
 * The allocations always add up to itemsTotal + extra, exactly.
 * `order` is the stable member order used to break ties (the app passes "you" first).
 */
export function splitItemized(items: readonly BillItem[], extra: Minor, order: readonly string[]): ItemizedSplit {
  if (items.length === 0) throw new RangeError('Add at least one item');
  if (!Number.isSafeInteger(extra) || extra < 0) throw new RangeError('Tax and tip must be zero or more');

  const rank = new Map(order.map((id, i) => [id, i]));
  const subtotal = new Map<string, number>();

  for (const [n, item] of items.entries()) {
    if (!Number.isSafeInteger(item.amount) || item.amount <= 0) {
      throw new RangeError(`Item ${n + 1} needs an amount above zero`);
    }
    if (item.memberIds.length === 0) throw new RangeError(`Choose who had item ${n + 1}`);
    for (const id of item.memberIds) {
      if (!rank.has(id)) throw new RangeError(`Unknown person on item ${n + 1}`);
    }
    const members = [...new Set(item.memberIds)].sort((a, b) => rank.get(a)! - rank.get(b)!);
    for (const a of splitEqual(item.amount, members)) subtotal.set(a.id, (subtotal.get(a.id) ?? 0) + a.amount);
  }

  const ids = order.filter((id) => subtotal.has(id));
  const subtotals = ids.map((id) => ({ id, amount: subtotal.get(id)! }));
  const itemsTotal = sumMinor(subtotals.map((s) => s.amount));

  // Tax and tip follow what each person ordered.
  const extraShares =
    extra > 0
      ? allocateByWeights(
          extra,
          ids,
          subtotals.map((s) => s.amount),
        )
      : ids.map((id) => ({ id, amount: 0 }));
  const allocations = subtotals.map((s, i) => ({ id: s.id, amount: s.amount + extraShares[i]!.amount }));

  return { allocations, subtotals, itemsTotal, extra, total: itemsTotal + extra };
}

/** The same split as a SplitEvaluation, for the screens that already show split results. */
export function evaluateItemized(items: readonly BillItem[], extra: Minor, order: readonly string[]): SplitEvaluation {
  const empty = { allocations: [] as Allocation[], allocated: 0, remaining: 0 };
  if (items.length === 0) return { ok: false, reason: 'zero_total', message: 'Add at least one item', ...empty };
  try {
    const { allocations, total } = splitItemized(items, extra, order);
    return { ok: true, allocations, allocated: total, remaining: 0 };
  } catch (e) {
    return { ok: false, reason: 'invalid', message: e instanceof Error ? e.message : 'Invalid items', ...empty };
  }
}
