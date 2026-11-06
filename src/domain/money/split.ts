import { assertMinor, sumMinor, type Minor } from './minor';

export const SPLIT_METHODS = ['equal', 'exact', 'percent', 'shares', 'adjust'] as const;
export type SplitMethod = (typeof SPLIT_METHODS)[number];

/** 100% expressed in basis points. Percent inputs allow two decimals (33.33% = 3333). */
export const FULL_PERCENT_BP = 10_000;
/** Shares allow two decimals too (1.5 shares = 150). */
export const SHARE_SCALE = 100;

export interface Allocation {
  id: string;
  amount: Minor;
}

/**
 * Split `total` proportionally to integer `weights` (largest-remainder method).
 *
 * Every participant gets floor(total × w / Σw). The leftover units (always
 * fewer than the number of participants) go one each to the participants
 * with the largest fractional remainder. Ties go to whoever comes first in
 * the given order, so the result depends only on the inputs. The allocations
 * always sum exactly to `total`. Negative totals (refunds) mirror positive ones.
 */
export function allocateByWeights(total: Minor, ids: readonly string[], weights: readonly number[]): Allocation[] {
  assertMinor(total, 'total');
  if (ids.length !== weights.length) throw new RangeError('ids and weights length mismatch');
  if (ids.length === 0) throw new RangeError('At least one participant is required');
  if (new Set(ids).size !== ids.length) throw new RangeError('Duplicate participant id');

  const w = weights.map((x, i) => {
    if (!Number.isSafeInteger(x) || x < 0) throw new RangeError(`Weight for ${ids[i]} must be a non-negative integer`);
    return BigInt(x);
  });
  const sumW = w.reduce((a, b) => a + b, 0n);
  if (sumW === 0n) throw new RangeError('Weights must not all be zero');

  const sign = total < 0 ? -1n : 1n;
  const abs = BigInt(Math.abs(total));

  const quotas = w.map((wi) => (abs * wi) / sumW);
  const remainders = w.map((wi) => (abs * wi) % sumW);
  let leftover = abs - quotas.reduce((a, b) => a + b, 0n);

  const order = ids
    .map((_, i) => i)
    .sort((a, b) => {
      const ra = remainders[a]!;
      const rb = remainders[b]!;
      if (ra !== rb) return ra > rb ? -1 : 1;
      return a - b;
    });

  for (const i of order) {
    if (leftover === 0n) break;
    // A zero-weight participant never receives a leftover unit.
    if (w[i] === 0n) continue;
    quotas[i] = quotas[i]! + 1n;
    leftover -= 1n;
  }

  return ids.map((id, i) => ({ id, amount: Number(quotas[i]! * sign) }));
}

export function splitEqual(total: Minor, ids: readonly string[]): Allocation[] {
  return allocateByWeights(
    total,
    ids,
    ids.map(() => 1),
  );
}

/** Percentages in basis points; must sum to exactly 10 000. */
export function splitPercent(total: Minor, ids: readonly string[], basisPoints: readonly number[]): Allocation[] {
  const sum = basisPoints.reduce((a, b) => a + b, 0);
  if (sum !== FULL_PERCENT_BP) throw new RangeError(`Percentages must total 100%, got ${sum / 100}%`);
  return allocateByWeights(total, ids, basisPoints);
}

/** Shares as integers scaled by SHARE_SCALE (or plain integers — only ratios matter). */
export function splitShares(total: Minor, ids: readonly string[], shares: readonly number[]): Allocation[] {
  return allocateByWeights(total, ids, shares);
}

/**
 * "Adjust" mode: each person's adjustment (±minor units) is applied on top
 * of an equal split of whatever remains. E.g. $120 with Jordan +$10 means
 * the other $110 is split equally and Jordan pays $10 more than the others.
 */
export function splitAdjust(total: Minor, ids: readonly string[], adjustments: readonly Minor[]): Allocation[] {
  adjustments.forEach((a) => assertMinor(a, 'adjustment'));
  const base = total - sumMinor(adjustments);
  if (Math.sign(base) === -Math.sign(total) && base !== 0) {
    throw new RangeError('Adjustments exceed the expense total');
  }
  const equal = splitEqual(base, ids);
  const result = equal.map((a, i) => ({ id: a.id, amount: a.amount + adjustments[i]! }));
  if (result.some((r) => Math.sign(r.amount) === -Math.sign(total) && r.amount !== 0)) {
    throw new RangeError('An adjustment makes someone’s share negative');
  }
  return result;
}

/* ------------------------------------------------------------------ */
/* Live split evaluation (drives screen 16 / 16b)                      */
/* ------------------------------------------------------------------ */

export interface SplitRowInput {
  id: string;
  included: boolean;
  /**
   * Raw per-mode value:
   *  - exact:   minor units
   *  - percent: basis points
   *  - shares:  scaled shares (×SHARE_SCALE)
   *  - adjust:  minor units (±)
   *  - equal:   ignored
   */
  value: number;
}

export type SplitEvaluation =
  | { ok: true; allocations: Allocation[]; allocated: Minor; remaining: 0 }
  | {
      ok: false;
      reason: 'no_participants' | 'zero_total' | 'under_allocated' | 'over_allocated' | 'invalid';
      message: string;
      /** Best-effort preview so the UI can still show per-row amounts. */
      allocations: Allocation[];
      allocated: Minor;
      /** total − allocated, in minor units (positive = still to assign). */
      remaining: Minor;
      /** For percent mode: 10 000 − Σbp. */
      remainingBp?: number;
    };

export function evaluateSplit(method: SplitMethod, total: Minor, rows: readonly SplitRowInput[]): SplitEvaluation {
  const active = rows.filter((r) => r.included);
  const ids = active.map((r) => r.id);
  const empty = { allocations: [] as Allocation[], allocated: 0, remaining: total };

  if (!Number.isSafeInteger(total) || total <= 0) {
    return { ok: false, reason: 'zero_total', message: 'Enter an amount first', ...empty };
  }
  if (active.length === 0) {
    return { ok: false, reason: 'no_participants', message: 'Choose at least one person', ...empty };
  }

  try {
    switch (method) {
      case 'equal':
        return done(splitEqual(total, ids));

      case 'exact': {
        const allocations = active.map((r) => ({ id: r.id, amount: r.value }));
        if (allocations.some((a) => !Number.isSafeInteger(a.amount) || a.amount < 0)) {
          return { ok: false, reason: 'invalid', message: 'Amounts must be zero or more', ...empty };
        }
        const allocated = sumMinor(allocations.map((a) => a.amount));
        return compare(total, allocations, allocated);
      }

      case 'percent': {
        const bp = active.map((r) => r.value);
        if (bp.some((x) => !Number.isSafeInteger(x) || x < 0)) {
          return { ok: false, reason: 'invalid', message: 'Percentages must be zero or more', ...empty };
        }
        const sumBp = bp.reduce((a, b) => a + b, 0);
        // Preview: what each row would get at its stated percentage.
        const preview = active.map((r) => ({
          id: r.id,
          amount: Number((BigInt(total) * BigInt(r.value)) / BigInt(FULL_PERCENT_BP)),
        }));
        if (sumBp !== FULL_PERCENT_BP) {
          const allocated = sumMinor(preview.map((p) => p.amount));
          const remainingBp = FULL_PERCENT_BP - sumBp;
          const pct = formatBp(Math.abs(remainingBp));
          return {
            ok: false,
            reason: remainingBp > 0 ? 'under_allocated' : 'over_allocated',
            message: remainingBp > 0 ? `${pct}% left to assign` : `${pct}% over 100%`,
            allocations: preview,
            allocated,
            remaining: total - allocated,
            remainingBp,
          };
        }
        return done(splitPercent(total, ids, bp));
      }

      case 'shares': {
        const shares = active.map((r) => r.value);
        if (shares.some((x) => !Number.isSafeInteger(x) || x < 0)) {
          return { ok: false, reason: 'invalid', message: 'Shares must be zero or more', ...empty };
        }
        if (shares.every((s) => s === 0)) {
          return { ok: false, reason: 'under_allocated', message: 'Give at least one person a share', ...empty };
        }
        return done(splitShares(total, ids, shares));
      }

      case 'adjust':
        return done(
          splitAdjust(
            total,
            ids,
            active.map((r) => r.value),
          ),
        );
    }
  } catch (e) {
    return { ok: false, reason: 'invalid', message: e instanceof Error ? e.message : 'Invalid split', ...empty };
  }
}

function done(allocations: Allocation[]): SplitEvaluation {
  return { ok: true, allocations, allocated: sumMinor(allocations.map((a) => a.amount)), remaining: 0 };
}

function compare(total: Minor, allocations: Allocation[], allocated: Minor): SplitEvaluation {
  if (allocated === total) return { ok: true, allocations, allocated, remaining: 0 };
  const remaining = total - allocated;
  return {
    ok: false,
    reason: remaining > 0 ? 'under_allocated' : 'over_allocated',
    message: remaining > 0 ? 'left to assign' : 'over the total',
    allocations,
    allocated,
    remaining,
  };
}

/** 3333 → "33.33", 2500 → "25" */
export function formatBp(bp: number): string {
  const whole = Math.trunc(bp / 100);
  const frac = Math.abs(bp % 100);
  return frac === 0 ? `${whole}` : `${whole}.${frac.toString().padStart(2, '0').replace(/0$/, '')}`;
}

/** "33.33" → 3333; null if invalid or more than 2 decimals. */
export function parseBp(input: string): number | null {
  const m = input.trim().match(/^(\d{0,3})(?:\.(\d{0,2}))?$/);
  if (!m || (m[1] === '' && (m[2] ?? '') === '')) return null;
  return Number(m[1] || '0') * 100 + Number((m[2] ?? '').padEnd(2, '0'));
}

/** Default per-mode values when a user switches modes, so the split starts valid where possible. */
export function defaultSplitValues(method: SplitMethod, total: Minor, ids: readonly string[]): number[] {
  if (ids.length === 0) return [];
  switch (method) {
    case 'equal':
    case 'adjust':
      return ids.map(() => 0);
    case 'shares':
      return ids.map(() => SHARE_SCALE);
    case 'percent':
      return allocateByWeights(
        FULL_PERCENT_BP,
        [...ids],
        ids.map(() => 1),
      ).map((a) => a.amount);
    case 'exact':
      return total > 0 ? splitEqual(total, ids).map((a) => a.amount) : ids.map(() => 0);
  }
}
