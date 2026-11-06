import {
  allocateByWeights,
  defaultSplitValues,
  evaluateSplit,
  formatBp,
  parseBp,
  splitAdjust,
  splitEqual,
  splitPercent,
  splitShares,
} from '../split';

const ids4 = ['you', 'malik', 'jordan', 'priya'];
const sum = (xs: { amount: number }[]) => xs.reduce((s, x) => s + x.amount, 0);
const amounts = (xs: { amount: number }[]) => xs.map((x) => x.amount);

describe('splitEqual', () => {
  it('splits evenly when divisible', () => {
    expect(amounts(splitEqual(12000, ids4))).toEqual([3000, 3000, 3000, 3000]);
  });

  it('gives leftover cents to the first members in stable order', () => {
    expect(amounts(splitEqual(1000, ['a', 'b', 'c']))).toEqual([334, 333, 333]);
    expect(amounts(splitEqual(1001, ['a', 'b', 'c']))).toEqual([334, 334, 333]);
    expect(amounts(splitEqual(1, ['a', 'b', 'c']))).toEqual([1, 0, 0]);
  });

  it('is deterministic for the same input order', () => {
    const a = splitEqual(10_000_01, ['x', 'y', 'z', 'w', 'v', 'u', 't']);
    const b = splitEqual(10_000_01, ['x', 'y', 'z', 'w', 'v', 'u', 't']);
    expect(a).toEqual(b);
  });

  it('handles a single participant', () => {
    expect(splitEqual(999, ['solo'])).toEqual([{ id: 'solo', amount: 999 }]);
  });

  it('mirrors refunds (negative totals)', () => {
    expect(amounts(splitEqual(-1000, ['a', 'b', 'c']))).toEqual([-334, -333, -333]);
  });

  it('works for zero-decimal currencies (JPY units)', () => {
    expect(amounts(splitEqual(1000, ['a', 'b', 'c']))).toEqual([334, 333, 333]);
  });

  it('rejects duplicate or empty participant lists', () => {
    expect(() => splitEqual(100, [])).toThrow();
    expect(() => splitEqual(100, ['a', 'a'])).toThrow(/Duplicate/);
  });

  it('rejects non-integer totals', () => {
    expect(() => splitEqual(10.5, ['a', 'b'])).toThrow(/safe integer/);
  });
});

describe('splitPercent', () => {
  it('matches the design example (25/25/30/20 of $120)', () => {
    expect(amounts(splitPercent(12000, ids4, [2500, 2500, 3000, 2000]))).toEqual([3000, 3000, 3600, 2400]);
  });

  it('uses largest remainder for thirds', () => {
    // 33.33 / 33.33 / 33.34 of $100.00
    const r = splitPercent(10000, ['a', 'b', 'c'], [3333, 3333, 3334]);
    expect(amounts(r)).toEqual([3333, 3333, 3334]);
    expect(sum(r)).toBe(10000);
  });

  it('allocates leftover by largest fractional remainder, ties to first', () => {
    // $0.10 split 50/50 → 5/5; $0.01 split 50/50 → 1/0
    expect(amounts(splitPercent(1, ['a', 'b'], [5000, 5000]))).toEqual([1, 0]);
    // 10% / 90% of 15 cents → 1.5 / 13.5 → tie on .5 → first gets it
    expect(amounts(splitPercent(15, ['a', 'b'], [1000, 9000]))).toEqual([2, 13]);
  });

  it('throws when percentages do not total 100%', () => {
    expect(() => splitPercent(100, ['a', 'b'], [5000, 4000])).toThrow(/100%/);
  });
});

describe('splitShares', () => {
  it('splits by ratio', () => {
    expect(amounts(splitShares(12000, ['a', 'b', 'c'], [100, 200, 300]))).toEqual([2000, 4000, 6000]);
  });

  it('supports fractional shares via scaling', () => {
    // 1.5 : 1 of $10.00 → 6.00 / 4.00
    expect(amounts(splitShares(1000, ['a', 'b'], [150, 100]))).toEqual([600, 400]);
  });

  it('gives nothing to zero-share participants, even leftover cents', () => {
    expect(amounts(splitShares(101, ['a', 'b', 'c'], [1, 0, 1]))).toEqual([51, 0, 50]);
  });

  it('rejects all-zero shares', () => {
    expect(() => splitShares(100, ['a', 'b'], [0, 0])).toThrow();
  });
});

describe('splitAdjust', () => {
  it('applies adjustments on top of an equal split of the rest', () => {
    // $120 with Jordan +$10 → others share $110 equally (27.50 each), Jordan 37.50
    expect(amounts(splitAdjust(12000, ids4, [0, 0, 1000, 0]))).toEqual([2750, 2750, 3750, 2750]);
  });

  it('handles negative adjustments', () => {
    // $90 with a −$15: base $105 → $35 each → a pays $20
    expect(amounts(splitAdjust(9000, ['a', 'b', 'c'], [-1500, 0, 0]))).toEqual([2000, 3500, 3500]);
  });

  it('rejects adjustments exceeding the total', () => {
    expect(() => splitAdjust(1000, ['a', 'b'], [1500, 0])).toThrow(/exceed/);
  });

  it('rejects adjustments that make a share negative', () => {
    // $10 with a −$20: base $30 → $15 each → a would pay −$5
    expect(() => splitAdjust(1000, ['a', 'b'], [-2000, 0])).toThrow(/negative/);
  });
});

describe('evaluateSplit', () => {
  const rows = (vals: number[], included = vals.map(() => true)) =>
    ids4.map((id, i) => ({ id, value: vals[i]!, included: included[i]! }));

  it('reports the 16b error state ($8.50 left to assign)', () => {
    const r = evaluateSplit('exact', 12000, rows([3000, 3000, 2750, 2400]));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('under_allocated');
      expect(r.allocated).toBe(11150);
      expect(r.remaining).toBe(850);
    }
  });

  it('reports over-allocation in exact mode', () => {
    const r = evaluateSplit('exact', 1000, rows([500, 500, 100, 0]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.remaining).toBe(-100);
  });

  it('accepts a balanced exact split', () => {
    const r = evaluateSplit('exact', 12000, rows([3000, 3000, 3600, 2400]));
    expect(r).toMatchObject({ ok: true, allocated: 12000, remaining: 0 });
  });

  it('excludes unchecked members', () => {
    const r = evaluateSplit('equal', 1000, rows([0, 0, 0, 0], [true, false, true, true]));
    expect(r.ok && r.allocations.map((a) => a.id)).toEqual(['you', 'jordan', 'priya']);
    expect(r.ok && amounts(r.allocations)).toEqual([334, 333, 333]);
  });

  it('reports remaining percentage in percent mode', () => {
    const r = evaluateSplit('percent', 12000, rows([2500, 2500, 2000, 2000]));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.remainingBp).toBe(1000);
      expect(r.message).toBe('10% left to assign');
      expect(r.remaining).toBe(1200);
    }
  });

  it('fails without participants or amount', () => {
    expect(evaluateSplit('equal', 1000, rows([0, 0, 0, 0], [false, false, false, false])).ok).toBe(false);
    expect(evaluateSplit('equal', 0, rows([0, 0, 0, 0])).ok).toBe(false);
  });

  it('rejects negative exact amounts', () => {
    expect(evaluateSplit('exact', 1000, rows([1500, -500, 0, 0])).ok).toBe(false);
  });
});

describe('defaultSplitValues', () => {
  it('starts percent at a valid 100% split', () => {
    const v = defaultSplitValues('percent', 1000, ['a', 'b', 'c']);
    expect(v).toEqual([3334, 3333, 3333]);
    expect(v.reduce((a, b) => a + b, 0)).toBe(10000);
  });

  it('starts exact at an equal split', () => {
    expect(defaultSplitValues('exact', 1000, ['a', 'b', 'c'])).toEqual([334, 333, 333]);
  });
});

describe('basis point helpers', () => {
  it('formats', () => {
    expect(formatBp(2500)).toBe('25');
    expect(formatBp(3333)).toBe('33.33');
    expect(formatBp(3330)).toBe('33.3');
    expect(formatBp(2505)).toBe('25.05');
  });
  it('parses', () => {
    expect(parseBp('25')).toBe(2500);
    expect(parseBp('33.33')).toBe(3333);
    expect(parseBp('.5')).toBe(50);
    expect(parseBp('33.333')).toBeNull();
    expect(parseBp('abc')).toBeNull();
    expect(parseBp('')).toBeNull();
  });
});

describe('invariant: allocations always sum to the total', () => {
  // Deterministic pseudo-random generator so failures are reproducible.
  let seed = 42;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;

  it('holds for 2,000 random weighted splits', () => {
    for (let i = 0; i < 2000; i++) {
      const n = 1 + Math.floor(rand() * 12);
      const ids = Array.from({ length: n }, (_, k) => `u${k}`);
      const weights = ids.map(() => Math.floor(rand() * 1000));
      if (weights.reduce((a, b) => a + b, 0) === 0) weights[0] = 1;
      const total = Math.floor(rand() * 10_000_000) * (rand() < 0.1 ? -1 : 1);
      const r = allocateByWeights(total, ids, weights);
      expect(sum(r)).toBe(total);
      r.forEach((a, k) => {
        if (weights[k] === 0) expect(a.amount).toBe(0);
        // Each allocation is within one minor unit of its exact proportional share.
        const exact = (total * weights[k]!) / weights.reduce((x, y) => x + y, 0);
        expect(Math.abs(a.amount - exact)).toBeLessThan(1);
      });
    }
  });

  it('holds for very large amounts without float error', () => {
    const total = 9_007_199_254_740_000; // near MAX_SAFE_INTEGER
    const r = allocateByWeights(total, ['a', 'b', 'c'], [1, 1, 1]);
    expect(r.reduce((s, x) => s + BigInt(x.amount), 0n)).toBe(BigInt(total));
  });
});
