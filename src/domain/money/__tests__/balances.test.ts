import {
  computeNetBalances,
  counterpartiesFor,
  simplifyDebts,
  summarizeForUser,
  type ExpenseLedgerEntry,
} from '../balances';
import { splitEqual } from '../split';

const exp = (id: string, paidBy: string, amount: number, ids: string[], currency = 'USD'): ExpenseLedgerEntry => ({
  id,
  currency,
  amount,
  paidBy,
  splits: splitEqual(amount, ids).map((a) => ({ userId: a.id, amount: a.amount })),
});

describe('computeNetBalances', () => {
  it('credits the payer and debits participants', () => {
    const nets = computeNetBalances([exp('e1', 'v', 12000, ['v', 'm', 'j', 'p'])]);
    expect(Object.fromEntries(nets.get('USD')!)).toEqual({ v: 9000, m: -3000, j: -3000, p: -3000 });
  });

  it('keeps currencies separate and never combines them', () => {
    const nets = computeNetBalances([exp('e1', 'v', 1000, ['v', 'm']), exp('e2', 'm', 842, ['v', 'm'], 'EUR')]);
    expect(nets.get('USD')!.get('v')).toBe(500);
    expect(nets.get('EUR')!.get('v')).toBe(-421);
  });

  it('ignores voided expenses', () => {
    const e = { ...exp('e1', 'v', 1000, ['v', 'm']), voided: true };
    expect(computeNetBalances([e]).size).toBe(0);
  });

  it('applies settlements as transfers, not spending', () => {
    const nets = computeNetBalances(
      [exp('e1', 'v', 1000, ['v', 'm'])],
      [{ id: 's1', currency: 'USD', amount: 500, fromUserId: 'm', toUserId: 'v' }],
    );
    expect(nets.get('USD')!.get('v')).toBe(0);
    expect(nets.get('USD')!.get('m')).toBe(0);
  });

  it('handles partial settlements and ignores voided ones', () => {
    const nets = computeNetBalances(
      [exp('e1', 'v', 1000, ['v', 'm'])],
      [
        { id: 's1', currency: 'USD', amount: 200, fromUserId: 'm', toUserId: 'v' },
        { id: 's2', currency: 'USD', amount: 300, fromUserId: 'm', toUserId: 'v', voided: true },
      ],
    );
    expect(nets.get('USD')!.get('m')).toBe(-300);
  });

  it('rejects expenses whose splits do not reconcile', () => {
    const bad: ExpenseLedgerEntry = {
      id: 'x',
      currency: 'USD',
      amount: 100,
      paidBy: 'a',
      splits: [{ userId: 'a', amount: 99 }],
    };
    expect(() => computeNetBalances([bad])).toThrow(/splits sum/);
  });

  it('always nets to zero per currency', () => {
    const nets = computeNetBalances([
      exp('e1', 'a', 1001, ['a', 'b', 'c']),
      exp('e2', 'b', 777, ['a', 'c']),
      exp('e3', 'c', 5, ['a', 'b', 'c']),
    ]);
    const total = [...nets.get('USD')!.values()].reduce((s, x) => s + x, 0);
    expect(total).toBe(0);
  });
});

describe('simplifyDebts', () => {
  it('reproduces the design example (Flatmates)', () => {
    const nets = new Map([
      ['you', 26000],
      ['priya', 4500],
      ['jordan', -9000],
      ['malik', -21500],
    ]);
    const t = simplifyDebts(nets);
    expect(t).toEqual([
      { from: 'malik', to: 'you', amount: 21500 },
      // you (45.00 left) and priya (45.00) tie → lower id first
      { from: 'jordan', to: 'priya', amount: 4500 },
      { from: 'jordan', to: 'you', amount: 4500 },
    ]);
  });

  it('needs at most n-1 transfers and clears every balance', () => {
    const nets = new Map([
      ['a', 100],
      ['b', 250],
      ['c', -50],
      ['d', -120],
      ['e', -180],
    ]);
    const t = simplifyDebts(nets);
    expect(t.length).toBeLessThanOrEqual(4);
    const after = new Map(nets);
    for (const x of t) {
      after.set(x.from, after.get(x.from)! + x.amount);
      after.set(x.to, after.get(x.to)! - x.amount);
    }
    expect([...after.values()].every((v) => v === 0)).toBe(true);
  });

  it('returns nothing when everyone is settled', () => {
    expect(
      simplifyDebts(
        new Map([
          ['a', 0],
          ['b', 0],
        ]),
      ),
    ).toEqual([]);
  });

  it('rejects unbalanced input', () => {
    expect(() => simplifyDebts(new Map([['a', 10]]))).toThrow(/sum to zero/);
  });
});

describe('summaries', () => {
  it('summarises per-group nets for the dashboard', () => {
    expect(summarizeForUser([26000, 4200, -15000, 0])).toEqual({ owedToYou: 30200, youOwe: 15000, net: 15200 });
  });

  it('derives counterparties from the user’s point of view', () => {
    const t = [
      { from: 'malik', to: 'you', amount: 21500 },
      { from: 'you', to: 'priya', amount: 4500 },
      { from: 'jordan', to: 'priya', amount: 100 },
    ];
    expect(Object.fromEntries(counterpartiesFor('you', t))).toEqual({ malik: 21500, priya: -4500 });
  });
});
