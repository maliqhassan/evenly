import { convertMinor, sumConverted, type FxRates } from '../convert';

const RATES: FxRates = {
  USD: '1',
  PKR: '276.622899',
  EUR: '0.903491',
  JPY: '159.795417',
  KWD: '0.31098',
};

describe('convertMinor', () => {
  it('converts between currencies at the given rates', () => {
    // $10.00 → PKR: 10 × 276.622899 = 2766.22899 → Rs 2,766.23
    expect(convertMinor(1000, 'USD', 'PKR', RATES)).toBe(276623);
    // PKR 2,766.23 → USD ≈ $10.00
    expect(convertMinor(276623, 'PKR', 'USD', RATES)).toBe(1000);
  });

  it('crosses through USD for two non-USD currencies', () => {
    // €10.00 → PKR: 10 × 276.622899 / 0.903491 = 3061.71
    expect(convertMinor(1000, 'EUR', 'PKR', RATES)).toBe(306171);
  });

  it('is the identity for the same currency, even with no rates', () => {
    expect(convertMinor(12345, 'PKR', 'PKR', {})).toBe(12345);
  });

  it('respects each currency’s decimals: yen has none, dinar has three', () => {
    // $10.00 → ¥1,598 (10 × 159.795417 = 1597.95…)
    expect(convertMinor(1000, 'USD', 'JPY', RATES)).toBe(1598);
    // ¥1,598 → $10.00
    expect(convertMinor(1598, 'JPY', 'USD', RATES)).toBe(1000);
    // $10.00 → KWD 3.110 (10 × 0.31098 = 3.1098)
    expect(convertMinor(1000, 'USD', 'KWD', RATES)).toBe(3110);
  });

  it('rounds half away from zero and handles negatives symmetrically', () => {
    const half: FxRates = { USD: '1', AAA: '0.5' }; // 1 cent = 0.5 units of AAA's cent
    expect(convertMinor(1, 'USD', 'AAA', half)).toBe(1); // 0.5 → 1
    expect(convertMinor(-1, 'USD', 'AAA', half)).toBe(-1);
    expect(convertMinor(3, 'USD', 'AAA', half)).toBe(2); // 1.5 → 2
    expect(convertMinor(-3, 'USD', 'AAA', half)).toBe(-2);
    expect(convertMinor(0, 'USD', 'PKR', RATES)).toBe(0);
  });

  it('gives the same answer every time (no floating point drift)', () => {
    const a = Array.from({ length: 5 }, () => convertMinor(123456789, 'USD', 'PKR', RATES));
    expect(new Set(a).size).toBe(1);
    expect(convertMinor(123456789, 'USD', 'PKR', RATES)).toBe(34150974874); // 1,234,567.89 × 276.622899 = 341,509,748.74
  });

  it('returns null when a currency has no rate, or the rate is unusable', () => {
    expect(convertMinor(100, 'USD', 'XYZ', RATES)).toBeNull();
    expect(convertMinor(100, 'XYZ', 'USD', RATES)).toBeNull();
    expect(convertMinor(100, 'USD', 'PKR', { USD: '1', PKR: '0' })).toBeNull();
    expect(convertMinor(100, 'USD', 'PKR', { USD: '1', PKR: 'abc' })).toBeNull();
    expect(convertMinor(100, 'USD', 'PKR', { USD: '1', PKR: '1e3' })).toBeNull();
    expect(convertMinor(1.5, 'USD', 'PKR', RATES)).toBeNull();
  });
});

describe('sumConverted', () => {
  it('adds amounts from several currencies as one amount', () => {
    const total = sumConverted(
      [
        { amount: 1000, currency: 'USD' },
        { amount: 276623, currency: 'PKR' },
        { amount: -500, currency: 'USD' },
      ],
      'USD',
      RATES,
    );
    expect(total).toBe(1000 + 1000 - 500);
  });

  it('is null if any one currency cannot be converted, rather than leaving it out', () => {
    expect(
      sumConverted(
        [
          { amount: 1000, currency: 'USD' },
          { amount: 500, currency: 'XYZ' },
        ],
        'USD',
        RATES,
      ),
    ).toBeNull();
  });

  it('is zero for nothing', () => {
    expect(sumConverted([], 'USD', RATES)).toBe(0);
  });
});
