import {
  dashboardSummary,
  expenseImpact,
  friendBalances,
  groupTransfers,
  myDebts,
  myGroupNets,
  remainingOwed,
  type BalanceLike,
} from '../ledger';

const rows: BalanceLike[] = [
  // Flatmates (USD): you +260, priya +45, jordan −90, malik −215
  { groupId: 'flat', profileId: 'you', currency: 'USD', net: 26000 },
  { groupId: 'flat', profileId: 'priya', currency: 'USD', net: 4500 },
  { groupId: 'flat', profileId: 'jordan', currency: 'USD', net: -9000 },
  { groupId: 'flat', profileId: 'malik', currency: 'USD', net: -21500 },
  // Lisbon (EUR): you −84.20, sanya +84.20
  { groupId: 'lis', profileId: 'you', currency: 'EUR', net: -8420 },
  { groupId: 'lis', profileId: 'sanya', currency: 'EUR', net: 8420 },
  // Office (USD): you −150, vicky +150
  { groupId: 'off', profileId: 'you', currency: 'USD', net: -15000 },
  { groupId: 'off', profileId: 'vicky', currency: 'USD', net: 15000 },
];

describe('dashboardSummary', () => {
  it('puts the preferred currency first and never merges currencies', () => {
    const s = dashboardSummary(rows, 'you', 'USD');
    expect(s.map((x) => x.currency)).toEqual(['USD', 'EUR']);
    expect(s[0]).toMatchObject({ owedToYou: 26000, youOwe: 15000, net: 11000 });
    expect(s[1]).toMatchObject({ owedToYou: 0, youOwe: 8420, net: -8420, groupIds: ['lis'] });
  });

  it('includes an empty preferred currency for brand-new users', () => {
    expect(dashboardSummary([], 'you', 'GBP')).toEqual([
      { currency: 'GBP', owedToYou: 0, youOwe: 0, net: 0, groupIds: [] },
    ]);
  });
});

describe('group helpers', () => {
  it('returns my per-currency nets in a group', () => {
    expect(myGroupNets(rows, 'flat', 'you')).toEqual([{ currency: 'USD', net: 26000 }]);
    expect(myGroupNets(rows, 'flat', 'nobody')).toEqual([]);
  });

  it('simplifies transfers per group and currency', () => {
    const t = groupTransfers(rows, 'flat');
    expect(t).toHaveLength(1);
    const total = t[0]!.transfers.reduce((s, x) => s + x.amount, 0);
    expect(total).toBe(30500); // what debtors owe in total
  });

  it('computes what is still owed between two people', () => {
    expect(remainingOwed(rows, 'lis', 'EUR', 'you', 'sanya')).toBe(8420);
    expect(remainingOwed(rows, 'lis', 'EUR', 'sanya', 'you')).toBe(0);
  });
});

describe('myDebts & friendBalances', () => {
  it('lists every transfer involving me', () => {
    const d = myDebts(rows, 'you');
    expect(d.filter((x) => x.from === 'you').map((x) => [x.to, x.amount, x.currency])).toEqual(
      expect.arrayContaining([
        ['sanya', 8420, 'EUR'],
        ['vicky', 15000, 'USD'],
      ]),
    );
  });

  it('aggregates per friend with sign = direction', () => {
    const f = friendBalances(rows, 'you');
    expect(f.get('sanya')!.byCurrency).toEqual([{ currency: 'EUR', net: -8420 }]);
    expect(f.get('vicky')!.byCurrency).toEqual([{ currency: 'USD', net: -15000 }]);
    const owedToMe = [...f.values()]
      .flatMap((x) => x.byCurrency)
      .filter((x) => x.net > 0)
      .reduce((s, x) => s + x.net, 0);
    expect(owedToMe).toBe(26000);
  });
});

describe('expenseImpact', () => {
  const e = {
    amount: 18000,
    paidBy: 'you',
    splits: [
      { profileId: 'you', amount: 4500 },
      { profileId: 'ana', amount: 13500 },
    ],
  };
  it('payer lent the others’ shares', () => expect(expenseImpact(e, 'you')).toEqual({ kind: 'lent', amount: 13500 }));
  it('participant owes their share', () => expect(expenseImpact(e, 'ana')).toEqual({ kind: 'owe', amount: 13500 }));
  it('outsider is not involved', () => expect(expenseImpact(e, 'zed')).toEqual({ kind: 'none', amount: 0 }));
});
