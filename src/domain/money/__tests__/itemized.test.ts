import { evaluateItemized, splitItemized } from '../itemized';

const ORDER = ['you', 'sara', 'ali'];
const by = (r: { allocations: { id: string; amount: number }[] }) =>
  Object.fromEntries(r.allocations.map((a) => [a.id, a.amount]));

describe('splitItemized', () => {
  it('splits each item among the people who had it', () => {
    const r = splitItemized(
      [
        { amount: 6000, memberIds: ['you', 'sara'] }, // pizza: 30.00 each
        { amount: 2000, memberIds: ['you'] }, // salad: you only
        { amount: 1000, memberIds: ['ali'] }, // soda: Ali only
      ],
      0,
      ORDER,
    );
    expect(by(r)).toEqual({ you: 5000, sara: 3000, ali: 1000 });
    expect(r.itemsTotal).toBe(9000);
    expect(r.total).toBe(9000);
  });

  it('shares tax and tip in proportion to what each person ordered', () => {
    const r = splitItemized(
      [
        { amount: 6000, memberIds: ['you'] },
        { amount: 2000, memberIds: ['sara'] },
      ],
      800, // 10% of 80.00
      ORDER,
    );
    // You ordered 75%, Sara 25%: 600 and 200 of the extra.
    expect(by(r)).toEqual({ you: 6600, sara: 2200 });
    expect(r.subtotals).toEqual([
      { id: 'you', amount: 6000 },
      { id: 'sara', amount: 2000 },
    ]);
    expect(r.total).toBe(8800);
  });

  it('never loses a cent: leftover cents go in member order', () => {
    // 1.00 shared by three: 34, 33, 33 (the first in order gets the extra cent).
    const r = splitItemized([{ amount: 100, memberIds: ['ali', 'sara', 'you'] }], 0, ORDER);
    expect(r.allocations).toEqual([
      { id: 'you', amount: 34 },
      { id: 'sara', amount: 33 },
      { id: 'ali', amount: 33 },
    ]);
  });

  it('always adds up to items plus tax and tip, for awkward numbers', () => {
    const items = [
      { amount: 1999, memberIds: ['you', 'sara', 'ali'] },
      { amount: 1, memberIds: ['you', 'sara'] },
      { amount: 3333, memberIds: ['sara', 'ali'] },
      { amount: 7, memberIds: ['ali'] },
    ];
    for (const extra of [0, 1, 7, 333, 1234, 99999]) {
      const r = splitItemized(items, extra, ORDER);
      const sum = r.allocations.reduce((s, a) => s + a.amount, 0);
      expect(sum).toBe(1999 + 1 + 3333 + 7 + extra);
      expect(r.allocations.every((a) => a.amount >= 0)).toBe(true);
    }
  });

  it('only includes people who had something', () => {
    const r = splitItemized([{ amount: 500, memberIds: ['sara'] }], 100, ORDER);
    expect(r.allocations).toEqual([{ id: 'sara', amount: 600 }]);
  });

  it('ignores a person listed twice on one item', () => {
    const r = splitItemized([{ amount: 1000, memberIds: ['you', 'you', 'sara'] }], 0, ORDER);
    expect(by(r)).toEqual({ you: 500, sara: 500 });
  });

  it('rejects empty bills, bad amounts, nobody on an item, unknown people and negative extras', () => {
    expect(() => splitItemized([], 0, ORDER)).toThrow(/at least one item/i);
    expect(() => splitItemized([{ amount: 0, memberIds: ['you'] }], 0, ORDER)).toThrow(/above zero/);
    expect(() => splitItemized([{ amount: 1.5, memberIds: ['you'] }], 0, ORDER)).toThrow(/above zero/);
    expect(() => splitItemized([{ amount: 100, memberIds: [] }], 0, ORDER)).toThrow(/who had/);
    expect(() => splitItemized([{ amount: 100, memberIds: ['zed'] }], 0, ORDER)).toThrow(/Unknown person/);
    expect(() => splitItemized([{ amount: 100, memberIds: ['you'] }], -1, ORDER)).toThrow(/zero or more/);
  });
});

describe('evaluateItemized', () => {
  it('returns an ok evaluation with the total allocated', () => {
    const r = evaluateItemized([{ amount: 900, memberIds: ['you', 'sara'] }], 100, ORDER);
    expect(r).toMatchObject({ ok: true, allocated: 1000, remaining: 0 });
  });

  it('explains what is wrong instead of throwing', () => {
    expect(evaluateItemized([], 0, ORDER)).toMatchObject({ ok: false, message: 'Add at least one item' });
    expect(evaluateItemized([{ amount: 100, memberIds: [] }], 0, ORDER)).toMatchObject({
      ok: false,
      message: 'Choose who had item 1',
    });
  });
});
