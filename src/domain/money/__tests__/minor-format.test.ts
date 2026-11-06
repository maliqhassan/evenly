import { currencyExponent, getCurrency } from '../currency';
import { formatMoney, MINUS } from '../format';
import { minorToDecimalString, parseMinor, sumMinor } from '../minor';

describe('currency exponents', () => {
  it('knows zero- and three-decimal currencies', () => {
    expect(currencyExponent('USD')).toBe(2);
    expect(currencyExponent('JPY')).toBe(0);
    expect(currencyExponent('KWD')).toBe(3);
  });
  it('accepts unknown but valid ISO codes and rejects invalid ones', () => {
    expect(getCurrency('XYZ').exponent).toBe(2);
    expect(() => getCurrency('usd')).toThrow();
  });
});

describe('parseMinor', () => {
  it.each([
    ['120', 'USD', 12000],
    ['120.5', 'USD', 12050],
    ['120.50', 'USD', 12050],
    ['.75', 'USD', 75],
    ['1,234.56', 'USD', 123456],
    ['0', 'USD', 0],
    ['1000', 'JPY', 1000],
    ['1.234', 'KWD', 1234],
  ])('parses %s %s → %d', (input, cur, expected) => {
    expect(parseMinor(input, cur)).toBe(expected);
  });

  it.each([
    ['120.555', 'USD'],
    ['10.5', 'JPY'],
    ['-5', 'USD'],
    ['abc', 'USD'],
    ['', 'USD'],
    ['.', 'USD'],
    ['1.2.3', 'USD'],
  ])('rejects %s %s', (input, cur) => {
    expect(parseMinor(input, cur)).toBeNull();
  });

  it('avoids float error (0.1 + 0.2 style inputs)', () => {
    expect(sumMinor([parseMinor('0.10', 'USD')!, parseMinor('0.20', 'USD')!])).toBe(30);
  });
});

describe('minorToDecimalString', () => {
  it('round-trips', () => {
    expect(minorToDecimalString(12050, 'USD')).toBe('120.50');
    expect(minorToDecimalString(5, 'USD')).toBe('0.05');
    expect(minorToDecimalString(-5, 'USD')).toBe('-0.05');
    expect(minorToDecimalString(1000, 'JPY')).toBe('1000');
    expect(minorToDecimalString(1234, 'KWD')).toBe('1.234');
  });
});

describe('formatMoney', () => {
  it('formats USD with grouping', () => {
    expect(formatMoney(143050, 'USD')).toBe('$1,430.50');
  });
  it('supports explicit signs', () => {
    expect(formatMoney(143050, 'USD', { sign: 'always' })).toBe('+$1,430.50');
    expect(formatMoney(-9000, 'USD')).toBe(`${MINUS}$90.00`);
    expect(formatMoney(-9000, 'USD', { sign: 'never' })).toBe('$90.00');
    expect(formatMoney(0, 'USD', { sign: 'always' })).toBe('$0.00');
  });
  it('formats EUR and JPY', () => {
    expect(formatMoney(8420, 'EUR')).toBe('€84.20');
    expect(formatMoney(1000, 'JPY')).toBe('¥1,000');
  });
  it('can trim whole-number fractions', () => {
    expect(formatMoney(13500, 'USD', { trimZeroFraction: true })).toBe('$135');
    expect(formatMoney(13550, 'USD', { trimZeroFraction: true })).toBe('$135.50');
  });
});
